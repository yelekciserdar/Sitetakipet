'use strict';
// Banka ekstresi: yükleme (mükerrer hareket atlanır), puanla kiracı eşleştirme, elle eşleştirme, yok sayma.
//
// Puanlama (Excel'deki mantık, sıkılaştırılmış hâliyle):
//   Ödeme açıklama kodu açıklamada geçiyor (en az 3 karakter, tam kelime)  +40
//   Gönderen IBAN kiracının IBAN'ı                                         +40
//   Kiracının adı ve soyadı açıklamada/gönderende tam kelime olarak geçiyor +30
//     (Excel'de "içeriyor mu" bakılıyordu; "Ali" adı "Aliye"de de eşleşiyordu)
//   Tutar: aylık kira, en eski açık borcun kalanı ya da toplam açık borç (±1 TL)  +30
//          daha az (kısmi)  +15  ·  daha fazla  +10
//   Tarih: açık bir borcun vadesine 10 gün içinde ya da aynı ayda            +20
// 80 ve üzeri tek aday → otomatik ödeme; 50–79 ya da 80 üzeri birden çok aday → "Kontrol Gerekli"; altı → "Eşleşmedi".
const crypto = require('node:crypto');
const v = require('./dogrula');
const { kayitYaz, paraMetni } = require('./cekirdek');
const { ekstreOku, normal } = require('./ekstre');
const kira = require('./kira');

const OTOMATIK_ESIK = 80;
const KONTROL_ESIK = 50;

const kelimeVar = (metin, kelime) => (` ${metin} `).includes(` ${kelime} `);

function adEslesir(metin, adSoyad) {
  const parcalar = normal(adSoyad).split(' ').filter((p) => p.length >= 2);
  if (!parcalar.length) return false;
  if (parcalar.length === 1 && parcalar[0].length < 4) return false;
  return parcalar.every((p) => kelimeVar(metin, p));
}

function gunFarki(a, b) {
  return Math.abs((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
}

function puanla(h, aday) {
  const metin = normal(`${h.aciklama} ${h.gonderen || ''}`);
  let puan = 0;
  const detay = [];
  if (aday.odeme_kodu && kelimeVar(metin, normal(aday.odeme_kodu))) { puan += 40; detay.push('Açıklama kodu +40'); }
  if (h.iban && aday.iban && h.iban === aday.iban) { puan += 40; detay.push('IBAN +40'); }
  if (adEslesir(metin, aday.ad_soyad)) { puan += 30; detay.push('Ad soyad +30'); }
  const t = kira.kurus(h.tutar);
  const acik = aday.borclar.filter((b) => b.kalan > 0);
  const hedefler = [kira.kurus(aday.aylik_kira), acik[0] ? kira.kurus(acik[0].kalan) : null, acik.length ? acik.reduce((s, b) => s + kira.kurus(b.kalan), 0) : null].filter((x) => x);
  if (hedefler.some((x) => Math.abs(x - t) <= 100)) { puan += 30; detay.push('Tutar +30'); }
  else if (t < kira.kurus(aday.aylik_kira)) { puan += 15; detay.push('Kısmi tutar +15'); }
  else { puan += 10; detay.push('Fazla tutar +10'); }
  const ay = h.tarih.slice(0, 7);
  if (aday.borclar.some((b) => b.kalan > 0 && (b.donem === ay || gunFarki(b.vade, h.tarih) <= 10))) { puan += 20; detay.push('Dönem/tarih +20'); }
  return { puan, detay: detay.join('; ') };
}

// Aday sözleşmeler: aktifler ve açık borcu kalan ayrılmışlar.
async function adaylar(c, ctx) {
  const { rows } = await c.query(
    `SELECT s.id, s.aylik_kira, s.durum, k.ad_soyad, k.iban, k.odeme_kodu, d.daire_no, d.blok
       FROM sozlesmeler s JOIN kisiler k ON k.id = s.kisi_id JOIN daireler d ON d.id = s.daire_id
      WHERE s.firma_id = $1`, [ctx.firma_id]);
  const borclar = await kira.borcListesi(c, ctx, {});
  const sonuc = [];
  for (const s of rows) {
    const b = borclar.filter((x) => x.sozlesme_id === s.id).sort((x, y) => (x.vade < y.vade ? -1 : 1));
    if (s.durum !== 'Aktif' && !b.some((x) => x.kalan > 0)) continue;
    sonuc.push({ ...s, borclar: b });
  }
  return sonuc;
}

function enIyi(h, liste) {
  const puanlar = liste.map((a) => ({ aday: a, ...puanla(h, a) })).sort((x, y) => y.puan - x.puan);
  const [ilk, ikinci] = puanlar;
  if (!ilk) return { puan: 0, detay: 'Aday kiracı yok', aday: null, belirsiz: false };
  return { ...ilk, belirsiz: !!ikinci && ikinci.puan >= OTOMATIK_ESIK && ikinci.puan === ilk.puan };
}

async function kaydet(c, ctx, hareketId, sozId, puan, sonuc, detay) {
  await c.query('INSERT INTO eslesme_kaydi (firma_id, hareket_id, sozlesme_id, puan, sonuc, detay, kullanici_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [ctx.firma_id, hareketId, sozId, puan, sonuc, detay, ctx.kullanici_id || null]);
}

async function bekleyenleriEsle(c, ctx) {
  const { rows: hareketler } = await c.query(
    `SELECT * FROM banka_hareketleri WHERE firma_id = $1 AND durum = 'Bekliyor' ORDER BY tarih, id FOR UPDATE`, [ctx.firma_id]);
  const sayac = { otomatik: 0, kontrol: 0, eslesmedi: 0 };
  for (const h of hareketler) {
    const liste = await adaylar(c, ctx); // her ödemeden sonra borçlar değişir, güncel hâlini kullan
    const e = enIyi(h, liste);
    let durum;
    if (e.aday && e.puan >= OTOMATIK_ESIK && !e.belirsiz) {
      await kira.tahsilatEkle(c, ctx, { sozlesme_id: e.aday.id, tarih: h.tarih, tutar: h.tutar, aciklama: `Banka: ${h.aciklama}`.slice(0, 500) },
        { kaynak: 'Banka', bankaHareketId: h.id });
      durum = 'Otomatik Eşleşti'; sayac.otomatik++;
    } else if (e.aday && e.puan >= KONTROL_ESIK) {
      durum = 'Kontrol Gerekli'; sayac.kontrol++;
    } else {
      durum = 'Eşleşmedi'; sayac.eslesmedi++;
    }
    const detay = e.belirsiz ? `${e.detay} (birden çok kiracı aynı puanı aldı)` : e.detay;
    await c.query('UPDATE banka_hareketleri SET durum = $1, onerilen_sozlesme_id = $2, puan = $3, detay = $4 WHERE id = $5',
      [durum, e.aday && e.puan >= KONTROL_ESIK ? e.aday.id : null, e.puan, detay, h.id]);
    await kaydet(c, ctx, h.id, e.aday?.id || null, e.puan, durum, detay);
  }
  return sayac;
}

async function ekstreYukle(c, ctx, g) {
  const ad = v.metin(g.dosya_adi, 'Dosya adı', { zorunlu: true, max: 200 });
  if (typeof g.icerik_base64 !== 'string' || !g.icerik_base64) throw v.hata('Dosya içeriği boş.');
  const buf = Buffer.from(g.icerik_base64, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw v.hata('Ekstre dosyası en fazla 5 MB olabilir.');
  const { hareketler, atlanan } = ekstreOku(buf, ad);
  if (!hareketler.length) throw v.hata('Ekstrede gelen (artı tutarlı) hareket bulunamadı.');
  let eklenen = 0; let mukerrer = 0;
  const sayac = new Map();
  for (const h of hareketler) {
    const anahtar = [h.tarih, h.tutar.toFixed(2), normal(h.aciklama), normal(h.gonderen || ''), h.iban || ''].join('|');
    const n = (sayac.get(anahtar) || 0) + 1; // aynı dosyada gerçekten iki aynı hareket varsa ikisi de girer
    sayac.set(anahtar, n);
    const iz = crypto.createHash('sha256').update(`${anahtar}#${n}`).digest('hex');
    const r = await c.query(
      `INSERT INTO banka_hareketleri (firma_id, tarih, aciklama, tutar, gonderen, iban, dosya, parmak_izi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (firma_id, parmak_izi) DO NOTHING`,
      [ctx.firma_id, h.tarih, h.aciklama || '-', h.tutar, h.gonderen, h.iban, h.dosya, iz]);
    if (r.rowCount) eklenen++; else mukerrer++;
  }
  const esleme = await bekleyenleriEsle(c, ctx);
  await kayitYaz(c, ctx, 'Banka ekstresi yüklendi',
    `${ad}: ${eklenen} yeni, ${mukerrer} daha önce yüklenmiş, ${atlanan} giden/boş satır atlandı; otomatik ${esleme.otomatik}, kontrol ${esleme.kontrol}, eşleşmeyen ${esleme.eslesmedi}`);
  return { eklenen, mukerrer, atlanan, ...esleme };
}

async function hareketler(c, ctx, q = {}) {
  const durum = q.durum ? v.secim(q.durum, 'Durum', ['Bekliyor', 'Otomatik Eşleşti', 'Kontrol Gerekli', 'Eşleşmedi', 'Elle Eşleşti', 'Yok Sayıldı', 'Açık']) : null;
  const { rows } = await c.query(
    `SELECT h.id, h.tarih, h.aciklama, h.tutar, h.gonderen, h.iban, h.dosya, h.durum, h.puan, h.detay, h.onerilen_sozlesme_id,
            k.ad_soyad AS onerilen_kiraci, d.daire_no AS onerilen_daire_no, d.blok AS onerilen_blok, os.ad AS onerilen_site,
            t.id AS tahsilat_id, tk.ad_soyad AS eslesen_kiraci, td.daire_no AS eslesen_daire_no, td.blok AS eslesen_blok, ts2.ad AS eslesen_site
       FROM banka_hareketleri h
       LEFT JOIN sozlesmeler s ON s.id = h.onerilen_sozlesme_id LEFT JOIN kisiler k ON k.id = s.kisi_id LEFT JOIN daireler d ON d.id = s.daire_id LEFT JOIN siteler os ON os.id = d.site_id
       LEFT JOIN tahsilatlar t ON t.banka_hareket_id = h.id AND NOT t.iptal
       LEFT JOIN sozlesmeler ts ON ts.id = t.sozlesme_id LEFT JOIN kisiler tk ON tk.id = ts.kisi_id LEFT JOIN daireler td ON td.id = ts.daire_id LEFT JOIN siteler ts2 ON ts2.id = td.site_id
      WHERE h.firma_id = $1 AND ($2::text IS NULL OR h.durum = $2 OR ($2 = 'Açık' AND h.durum IN ('Kontrol Gerekli', 'Eşleşmedi', 'Bekliyor')))
      ORDER BY h.tarih DESC, h.id DESC LIMIT 2000`, [ctx.firma_id, durum]);
  return rows;
}

async function hareketKilitle(c, ctx, id) {
  id = v.kimlik(id, 'Banka hareketi');
  const { rows: [h] } = await c.query('SELECT * FROM banka_hareketleri WHERE id = $1 AND firma_id = $2 FOR UPDATE', [id, ctx.firma_id]);
  if (!h) throw v.hata('Banka hareketi bulunamadı.', 404);
  const { rows: [t] } = await c.query('SELECT id FROM tahsilatlar WHERE banka_hareket_id = $1 AND NOT iptal', [id]);
  if (t) throw v.hata('Bu hareket zaten bir ödemeye dönüştürülmüş. Değiştirmek için önce o ödemeyi iptal edin.', 409);
  return h;
}

async function elleEslestir(c, ctx, id, g) {
  const h = await hareketKilitle(c, ctx, id);
  const sozId = v.kimlik(g.sozlesme_id, 'Kiracı/sözleşme');
  await kira.tahsilatEkle(c, ctx, { sozlesme_id: sozId, tarih: h.tarih, tutar: h.tutar, aciklama: `Banka: ${h.aciklama}`.slice(0, 500) },
    { kaynak: 'Banka', bankaHareketId: h.id });
  await c.query(`UPDATE banka_hareketleri SET durum = 'Elle Eşleşti', onerilen_sozlesme_id = $1 WHERE id = $2`, [sozId, h.id]);
  await kaydet(c, ctx, h.id, sozId, h.puan, 'Elle Eşleşti', null);
  return { id: h.id };
}

async function yokSay(c, ctx, id) {
  const h = await hareketKilitle(c, ctx, id);
  await c.query(`UPDATE banka_hareketleri SET durum = 'Yok Sayıldı' WHERE id = $1`, [h.id]);
  await kaydet(c, ctx, h.id, null, h.puan, 'Yok Sayıldı', null);
  await kayitYaz(c, ctx, 'Banka hareketi yok sayıldı', `${h.tarih} ${paraMetni(h.tutar)} ${h.aciklama}`.slice(0, 300));
  return { id: h.id };
}

// Yeni kiracı/kod/IBAN girildikten sonra "Kontrol Gerekli" ve "Eşleşmedi" hareketleri yeniden dener.
async function yenidenEsle(c, ctx) {
  await c.query(
    `UPDATE banka_hareketleri h SET durum = 'Bekliyor' WHERE h.firma_id = $1 AND h.durum IN ('Kontrol Gerekli', 'Eşleşmedi')
        AND NOT EXISTS (SELECT 1 FROM tahsilatlar t WHERE t.banka_hareket_id = h.id AND NOT t.iptal)`, [ctx.firma_id]);
  return bekleyenleriEsle(c, ctx);
}

module.exports = { ekstreYukle, hareketler, elleEslestir, yokSay, yenidenEsle, puanla, adEslesir };
