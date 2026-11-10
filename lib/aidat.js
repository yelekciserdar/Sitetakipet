'use strict';
// Aidat iş kuralları (site yönetimi): aidat planı, aylık aidat borcu (tahakkuk), ek toplama, tahsilat ve dağıtımı,
// makbuz, borç listesi, borçlular ve gecikme tazminatı, giderler ve kasa, aidat özeti.
//
// Borç bağımsız bölüme (daireye) yazılır; ödemeyi kiracı da malik de yapabilir (KMK: ikisi birlikte sorumlu).
// Gecikme tazminatı açık borcun kalanı üzerinden, vadeden itibaren gün bazında hesaplanır:
//   kalan × (aylık oran / 100) × gecikme günü / 30   (oran sitede ayarlanır, KMK md. 20: en çok %5)
// Tazminat bilgi olarak gösterilir; borca yazılmaz.
const v = require('./dogrula');
const { kayitYaz, paraMetni } = require('./cekirdek');
const { siteFiltresi, siteDenetle, siteBul } = require('./site');
const { ibanNormal } = require('./ekstre');

const kurus = (n) => Math.round(Number(n) * 100);
const tl = (k) => k / 100;
function bugun() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}
const buAy = () => bugun().slice(0, 7);
const daireAdi = (d) => (d.blok ? `${d.blok} Blok ${d.daire_no}` : d.daire_no);
const DAIRE_SIRA = `si.ad, d.blok NULLS FIRST, NULLIF(substring(d.daire_no from '^[0-9]+'), '')::int NULLS LAST, d.daire_no`;
const YONTEMLER = ['Sabit', 'Eşit', 'Arsa payı', 'Metrekare'];
const PAY_YONTEMLERI = ['Eşit', 'Arsa payı', 'Metrekare'];
const GIDER_KATEGORILERI = ['Elektrik', 'Su', 'Doğalgaz', 'Temizlik', 'Güvenlik', 'Bakım-Onarım', 'Asansör', 'Bahçe', 'Personel', 'Sigorta',
  'Yönetim Ücreti', 'Kırtasiye', 'Banka Masrafı', 'Diğer'];

// ---------- Aidat planı ----------

async function aidatPlani(c, ctx, siteId) {
  const s = await siteBul(c, ctx, siteId);
  const { rows: [p] } = await c.query(
    `SELECT id, ad, aidat_yontemi, aidat_tutari, aidat_gunu, aidat_baslangic, gecikme_orani, iban FROM siteler WHERE id = $1`, [s.id]);
  const daireler = await c.query(
    `SELECT d.id, d.daire_no, d.blok, d.metrekare, d.arsa_payi, d.aidat_ozel, d.tip FROM daireler d JOIN siteler si ON si.id = d.site_id
      WHERE d.site_id = $1 AND d.aktif ORDER BY ${DAIRE_SIRA}`, [s.id]);
  let paylar = [];
  let hata = null;
  if (p.aidat_tutari) {
    try { paylar = aidatPaylari(p.aidat_yontemi, p.aidat_tutari, daireler.rows); } catch (e) { hata = e.message; }
  }
  const tutarlar = new Map(paylar.map((x) => [x.daire_id, x.tutar]));
  return {
    ...p, hata,
    daireler: daireler.rows.map((d) => ({ ...d, aylik_aidat: tutarlar.get(d.id) ?? null })),
    aylik_toplam: tl(paylar.reduce((t, x) => t + kurus(x.tutar), 0)),
  };
}

// Plana göre her dairenin aylık aidatı. Özel tutarlı daireler o tutarı öder; bütçenin kalanı diğerlerine
// ağırlığa göre bölünür. Kuruş artığı en büyük kesirli paya verilir; toplam bütçeye kuruşu kuruşuna eşittir.
function aidatPaylari(yontem, tutar, daireler) {
  if (!daireler.length) return [];
  if (yontem === 'Sabit') return daireler.map((d) => ({ daire_id: d.id, tutar: d.aidat_ozel ?? Number(tutar) }));
  const ozel = daireler.filter((d) => d.aidat_ozel);
  const digerleri = daireler.filter((d) => !d.aidat_ozel);
  const kalan = kurus(tutar) - ozel.reduce((t, d) => t + kurus(d.aidat_ozel), 0);
  const sonuc = ozel.map((d) => ({ daire_id: d.id, tutar: Number(d.aidat_ozel) }));
  if (!digerleri.length) return sonuc;
  if (kalan <= 0) throw v.hata('Özel aidatların toplamı aylık bütçeyi aşıyor; bütçeyi ya da özel tutarları düzeltin.');
  return sonuc.concat(paylastir(yontem, kalan, digerleri).map((x) => ({ daire_id: x.daire_id, tutar: tl(x.kurus) })));
}

// Kuruş cinsinden toplamı dairelere ağırlığa göre böler (en büyük kalan yöntemi).
function paylastir(yontem, toplamKurus, daireler) {
  const agirlik = (d) => (yontem === 'Eşit' ? 1 : yontem === 'Arsa payı' ? Number(d.arsa_payi) : Number(d.metrekare));
  const eksik = daireler.filter((d) => !(agirlik(d) > 0));
  if (eksik.length) {
    const alan = yontem === 'Arsa payı' ? 'arsa payı' : 'metrekare';
    throw v.hata(`${eksik.length} dairenin ${alan} bilgisi eksik (${eksik.slice(0, 5).map(daireAdi).join(', ')}${eksik.length > 5 ? '…' : ''}).`);
  }
  const top = daireler.reduce((t, d) => t + agirlik(d), 0);
  const ham = daireler.map((d) => { const x = (toplamKurus * agirlik(d)) / top; return { daire_id: d.id, kurus: Math.floor(x), artik: x - Math.floor(x) }; });
  let eksikKurus = toplamKurus - ham.reduce((t, x) => t + x.kurus, 0);
  [...ham].sort((a, b) => b.artik - a.artik || a.daire_id - b.daire_id).forEach((x) => { if (eksikKurus > 0) { x.kurus++; eksikKurus--; } });
  return ham;
}

async function aidatPlaniKaydet(c, ctx, siteId, g) {
  const s = await siteBul(c, ctx, siteId);
  const yontem = v.secim(g.aidat_yontemi, 'Aidat yöntemi', YONTEMLER, { varsayilan: 'Sabit' });
  const tutar = v.tutar(g.aidat_tutari, yontem === 'Sabit' ? 'Daire başı aylık aidat' : 'Aylık bütçe', { pozitif: true });
  const gun = Number(g.aidat_gunu ?? 10);
  if (!Number.isInteger(gun) || gun < 1 || gun > 28) throw v.hata('Son ödeme günü 1–28 arasında olmalı.');
  const baslangic = g.aidat_baslangic ? v.donem(g.aidat_baslangic, 'Başlangıç dönemi') : buAy();
  const oran = g.gecikme_orani === undefined || g.gecikme_orani === null || g.gecikme_orani === '' ? 5 : Number(g.gecikme_orani);
  if (!Number.isFinite(oran) || oran < 0 || oran > 5) throw v.hata('Gecikme tazminatı aylık %0–5 arasında olmalı (KMK md. 20).');
  const ibanHam = v.metin(g.iban, 'IBAN', { max: 50 });
  const iban = ibanHam ? ibanNormal(ibanHam) : null;
  if (iban && (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || (iban.startsWith('TR') && iban.length !== 26))) throw v.hata('IBAN geçersiz.');
  await c.query(
    `UPDATE siteler SET aidat_yontemi = $1, aidat_tutari = $2, aidat_gunu = $3, aidat_baslangic = $4, gecikme_orani = $5, iban = $6 WHERE id = $7`,
    [yontem, tutar, gun, baslangic, oran, iban, s.id]);
  const plan = await aidatPlani(c, ctx, s.id);
  if (plan.hata) throw v.hata(plan.hata);
  await kayitYaz(c, ctx, 'Aidat planı kaydedildi', `${s.ad}: ${yontem}, ${paraMetni(tutar)}${yontem === 'Sabit' ? '/daire' : ' bütçe'}, son gün ${gun}, ${baslangic}'dan itibaren`);
  return plan;
}

// Dairenin aidatla ilgili bilgileri (arsa payı, özel aidat).
async function daireAidatKaydet(c, ctx, daireId, g) {
  const id = v.kimlik(daireId, 'Daire');
  const { rows: [d] } = await c.query('SELECT id, site_id, daire_no, blok FROM daireler WHERE id = $1 AND firma_id = $2', [id, ctx.firma_id]);
  if (!d) throw v.hata('Daire bulunamadı.', 404);
  siteDenetle(ctx, d.site_id, 'Daire');
  const sayi = (x, ad) => (x === undefined || x === null || x === '' ? null : v.tutar(x, ad, { pozitif: true }));
  const arsa = sayi(g.arsa_payi, 'Arsa payı');
  const ozel = sayi(g.aidat_ozel, 'Özel aidat');
  await c.query('UPDATE daireler SET arsa_payi = $1, aidat_ozel = $2 WHERE id = $3', [arsa, ozel, id]);
  await kayitYaz(c, ctx, 'Daire aidat bilgisi', `${daireAdi(d)}: arsa payı ${arsa ?? '-'}, özel aidat ${ozel ? paraMetni(ozel) : '-'}`);
  return { id };
}

// ---------- Tahakkuk ----------

function vadeTarihi(donem, gun) {
  const [y, m] = donem.split('-').map(Number);
  const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${donem}-${String(Math.min(gun, son)).padStart(2, '0')}`;
}

// Dönemin aidat borçlarını yazar: planı olan ve dönemi başlamış her sitenin her aktif dairesine bir borç.
// İki kez çalışsa da çift borç oluşmaz. Avansı olan dairelerde avans hemen düşer.
async function tahakkuk(c, ctx, g = {}) {
  const donem = v.donem(g.donem || buAy());
  const siteId = v.kimlik(g.site_id, 'Site', { zorunlu: false });
  if (siteId) await siteBul(c, ctx, siteId);
  const { rows: siteler } = await c.query(
    `SELECT id, ad, aidat_yontemi, aidat_tutari, aidat_gunu FROM siteler
      WHERE firma_id = $1 AND aktif AND aidat_tutari IS NOT NULL AND aidat_baslangic <= $2 AND ($3::bigint IS NULL OR id = $3)
        AND ($4::bigint[] IS NULL OR id = ANY($4))`, [ctx.firma_id, donem, siteId, ctx.siteler || null]);
  let olusan = 0;
  const hatalar = [];
  for (const s of siteler) {
    const { rows: daireler } = await c.query(
      `SELECT d.id, d.daire_no, d.blok, d.metrekare, d.arsa_payi, d.aidat_ozel FROM daireler d WHERE d.site_id = $1 AND d.aktif ORDER BY d.id`, [s.id]);
    let paylar;
    try { paylar = aidatPaylari(s.aidat_yontemi, s.aidat_tutari, daireler); } catch (e) { hatalar.push(`${s.ad}: ${e.message}`); continue; }
    const vade = vadeTarihi(donem, s.aidat_gunu);
    for (const p of paylar) {
      const r = await c.query(
        `INSERT INTO aidat_borclari (firma_id, daire_id, tur, donem, vade, tutar, aciklama) VALUES ($1, $2, 'Aidat', $3, $4, $5, 'Aylık aidat')
         ON CONFLICT (daire_id, donem) WHERE tur = 'Aidat' AND NOT iptal DO NOTHING RETURNING daire_id`,
        [ctx.firma_id, p.daire_id, donem, vade, p.tutar]);
      if (r.rowCount) { olusan++; await dagit(c, p.daire_id); }
    }
  }
  if (!g.sessiz && (olusan || ctx.kullanici_id)) await kayitYaz(c, ctx, 'Aidat borçları oluşturuldu', `${donem}: ${olusan} borç${hatalar.length ? ` / ${hatalar.join('; ')}` : ''}`);
  return { donem, olusan, hatalar };
}

// Dairenin bütün (iptal edilmemiş) aidat tahsilatlarını, açık borçlarına en eski vadeden başlayarak yeniden dağıtır.
// Para hareketi değiştiren her işlemden sonra çağrılır; sonuç her zaman aynıdır (sıra: tahsilat tarihi, borç vadesi).
async function dagit(c, daireId) {
  await c.query('SELECT id FROM daireler WHERE id = $1 FOR UPDATE', [daireId]);
  await c.query('DELETE FROM aidat_dagilimi ad USING aidat_tahsilatlari t WHERE ad.tahsilat_id = t.id AND t.daire_id = $1', [daireId]);
  const { rows: tah } = await c.query('SELECT id, tutar FROM aidat_tahsilatlari WHERE daire_id = $1 AND NOT iptal ORDER BY tarih, id', [daireId]);
  const { rows: bor } = await c.query('SELECT id, tutar FROM aidat_borclari WHERE daire_id = $1 AND NOT iptal ORDER BY vade, id', [daireId]);
  const satirlar = [];
  let bi = 0; let borcKalan = bor.length ? kurus(bor[0].tutar) : 0;
  for (const t of tah) {
    let kalan = kurus(t.tutar);
    while (kalan > 0 && bi < bor.length) {
      const pay = Math.min(kalan, borcKalan);
      satirlar.push([t.id, bor[bi].id, tl(pay)]);
      kalan -= pay; borcKalan -= pay;
      if (borcKalan === 0) { bi++; borcKalan = bi < bor.length ? kurus(bor[bi].tutar) : 0; }
    }
  }
  if (satirlar.length) {
    const deger = satirlar.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
    await c.query(`INSERT INTO aidat_dagilimi (tahsilat_id, borc_id, tutar) VALUES ${deger}`, satirlar.flat());
  }
}

// ---------- Ek toplama ----------

async function ekToplamaEkle(c, ctx, g) {
  const s = await siteBul(c, ctx, g.site_id);
  if (!s.aktif) throw v.hata('Pasif sitede ek toplama yapılamaz.');
  const aciklama = v.metin(g.aciklama, 'Açıklama', { zorunlu: true, max: 300 });
  const toplam = v.tutar(g.toplam, 'Toplam tutar', { pozitif: true });
  const yontem = v.secim(g.yontem, 'Paylaştırma', PAY_YONTEMLERI, { varsayilan: 'Arsa payı' });
  const vade = v.tarih(g.vade, 'Son ödeme tarihi');
  const { rows: daireler } = await c.query('SELECT id, daire_no, blok, metrekare, arsa_payi FROM daireler WHERE site_id = $1 AND aktif ORDER BY id', [s.id]);
  if (!daireler.length) throw v.hata('Sitede aktif daire yok.');
  const paylar = paylastir(yontem, kurus(toplam), daireler);
  const { rows: [t] } = await c.query(
    `INSERT INTO ek_toplamalar (firma_id, site_id, aciklama, toplam, yontem, vade, olusturan_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ctx.firma_id, s.id, aciklama, toplam, yontem, vade, ctx.kullanici_id || null]);
  for (const p of paylar) {
    if (p.kurus <= 0) continue;
    await c.query(
      `INSERT INTO aidat_borclari (firma_id, daire_id, tur, donem, vade, tutar, aciklama, toplama_id) VALUES ($1, $2, 'Ek Toplama', $3, $4, $5, $6, $7)`,
      [ctx.firma_id, p.daire_id, vade.slice(0, 7), vade, tl(p.kurus), aciklama, t.id]);
    await dagit(c, p.daire_id);
  }
  await kayitYaz(c, ctx, 'Ek toplama yapıldı', `${s.ad}: ${aciklama}, ${paraMetni(toplam)} (${yontem}, ${daireler.length} daire)`);
  return { id: t.id, daire_sayisi: daireler.length };
}

async function ekToplamalar(c, ctx, q = {}) {
  const { rows } = await c.query(
    `SELECT e.id, e.site_id, si.ad AS site, e.aciklama, e.toplam, e.yontem, e.vade, e.iptal, e.olusturma,
            COALESCE((SELECT sum(ad.tutar) FROM aidat_borclari b JOIN aidat_dagilimi ad ON ad.borc_id = b.id WHERE b.toplama_id = e.id AND NOT b.iptal), 0) AS tahsil_edilen
       FROM ek_toplamalar e JOIN siteler si ON si.id = e.site_id
      WHERE e.firma_id = $1 AND ($2::bigint[] IS NULL OR e.site_id = ANY($2)) ORDER BY e.vade DESC, e.id DESC`, [ctx.firma_id, siteFiltresi(ctx, q)]);
  return rows;
}

async function ekToplamaIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Ek toplama');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [e] } = await c.query('SELECT id, site_id, aciklama, toplam FROM ek_toplamalar WHERE id = $1 AND firma_id = $2 AND NOT iptal FOR UPDATE', [id, ctx.firma_id]);
  if (!e) throw v.hata('İptal edilecek ek toplama bulunamadı.', 404);
  siteDenetle(ctx, e.site_id, 'Ek toplama');
  await c.query('UPDATE ek_toplamalar SET iptal = true WHERE id = $1', [id]);
  const { rows } = await c.query(
    `UPDATE aidat_borclari SET iptal = true, aciklama = left(COALESCE(aciklama, '') || ' / İptal: ' || $2, 500) WHERE toplama_id = $1 AND NOT iptal RETURNING daire_id`, [id, neden]);
  for (const r of rows) await dagit(c, r.daire_id);
  await kayitYaz(c, ctx, 'Ek toplama iptal edildi', `${e.aciklama} ${paraMetni(e.toplam)} / ${neden}`);
  return { id };
}

// ---------- Tahsilat ve makbuz ----------

async function daireBul(c, ctx, daireId) {
  const id = v.kimlik(daireId, 'Daire');
  const { rows: [d] } = await c.query(
    `SELECT d.id, d.site_id, si.ad AS site, d.daire_no, d.blok, d.aktif FROM daireler d JOIN siteler si ON si.id = d.site_id WHERE d.id = $1 AND d.firma_id = $2`,
    [id, ctx.firma_id]);
  if (!d) throw v.hata('Daire bulunamadı.', 404);
  siteDenetle(ctx, d.site_id, 'Daire');
  return d;
}

async function tahsilatEkle(c, ctx, g, { kaynak = 'Elle', bankaHareketId = null } = {}) {
  const d = await daireBul(c, ctx, g.daire_id);
  const tarih = v.tarih(g.tarih, 'Ödeme tarihi');
  if (tarih > bugun()) throw v.hata('Ödeme tarihi ileri bir gün olamaz.');
  const tutar = v.tutar(g.tutar, 'Tutar', { pozitif: true });
  const odeme = v.secim(g.odeme_turu, 'Ödeme türü', v.ODEME_TURLERI, { varsayilan: kaynak === 'Banka' ? 'Havale/EFT' : 'Nakit' });
  const odeyen = v.metin(g.odeyen, 'Ödeyen', { max: 120 });
  const aciklama = v.metin(g.aciklama, 'Açıklama', { max: 500 });
  const { rows: [f] } = await c.query('UPDATE firmalar SET son_makbuz_no = son_makbuz_no + 1 WHERE id = $1 RETURNING son_makbuz_no', [ctx.firma_id]);
  const { rows: [t] } = await c.query(
    `INSERT INTO aidat_tahsilatlari (firma_id, daire_id, makbuz_no, tarih, tutar, odeme_turu, odeyen, kaynak, banka_hareket_id, aciklama, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [ctx.firma_id, d.id, f.son_makbuz_no, tarih, tutar, odeme, odeyen, kaynak, bankaHareketId, aciklama, ctx.kullanici_id || null]);
  await dagit(c, d.id);
  await kayitYaz(c, ctx, 'Aidat ödemesi alındı', `${d.site} ${daireAdi(d)} / ${paraMetni(tutar)} / makbuz ${f.son_makbuz_no}${kaynak === 'Banka' ? ' (banka)' : ''}`);
  return { id: t.id, makbuz_no: f.son_makbuz_no };
}

async function tahsilatIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Tahsilat');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [t0] } = await c.query('SELECT t.id, d.site_id FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id WHERE t.id = $1 AND t.firma_id = $2', [id, ctx.firma_id]);
  if (!t0) throw v.hata('İptal edilecek tahsilat bulunamadı.', 404);
  siteDenetle(ctx, t0.site_id, 'Tahsilat');
  const { rows: [t] } = await c.query(
    'UPDATE aidat_tahsilatlari SET iptal = true, iptal_nedeni = $2 WHERE id = $1 AND NOT iptal RETURNING daire_id, tutar, makbuz_no, banka_hareket_id', [id, neden]);
  if (!t) throw v.hata('Tahsilat zaten iptal edilmiş.', 409);
  if (t.banka_hareket_id) await c.query(`UPDATE banka_hareketleri SET durum = 'Kontrol Gerekli' WHERE id = $1`, [t.banka_hareket_id]);
  await dagit(c, t.daire_id);
  await kayitYaz(c, ctx, 'Aidat ödemesi iptal edildi', `Makbuz ${t.makbuz_no} ${paraMetni(t.tutar)} / ${neden}`);
  return { id };
}

async function tahsilatlar(c, ctx, q = {}) {
  const b = v.tarih(q.baslangic, 'Başlangıç', { zorunlu: false });
  const s = v.tarih(q.bitis, 'Bitiş', { zorunlu: false });
  const daireId = v.kimlik(q.daire_id, 'Daire', { zorunlu: false });
  const { rows } = await c.query(
    `SELECT t.id, t.makbuz_no, t.tarih, t.tutar, t.odeme_turu, t.odeyen, t.kaynak, t.aciklama, t.iptal, t.iptal_nedeni,
            t.daire_id, d.site_id, si.ad AS site, d.daire_no, d.blok
       FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id JOIN siteler si ON si.id = d.site_id
      WHERE t.firma_id = $1 AND ($2::date IS NULL OR t.tarih >= $2) AND ($3::date IS NULL OR t.tarih <= $3)
        AND ($4::bigint IS NULL OR t.daire_id = $4) AND ($5::bigint[] IS NULL OR d.site_id = ANY($5))
      ORDER BY t.tarih DESC, t.id DESC LIMIT 2000`, [ctx.firma_id, b, s, daireId, siteFiltresi(ctx, q)]);
  return rows;
}

const BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
function ucBasamak(n) {
  const y = Math.floor(n / 100); const o = Math.floor((n % 100) / 10); const b = n % 10;
  return (y ? (y > 1 ? BIRLER[y] : '') + 'yüz' : '') + ONLAR[o] + BIRLER[b];
}
// Makbuzdaki "yalnız ... TL ... kuruş" yazısı.
function yaziyla(tutar) {
  const k = kurus(tutar); let lira = Math.floor(k / 100); const kr = k % 100;
  const basamak = ['', 'bin', 'milyon', 'milyar'];
  let yazi = ''; let i = 0;
  if (lira === 0) yazi = 'sıfır';
  while (lira > 0) {
    const parca = lira % 1000;
    if (parca) yazi = (i === 1 && parca === 1 ? '' : ucBasamak(parca)) + basamak[i] + yazi;
    lira = Math.floor(lira / 1000); i++;
  }
  return `Yalnız ${yazi} Türk lirası${kr ? ` ${ucBasamak(kr)} kuruş` : ''}`;
}

async function makbuz(c, ctx, id) {
  id = v.kimlik(id, 'Tahsilat');
  const { rows: [t] } = await c.query(
    `SELECT t.id, t.makbuz_no, t.tarih, t.tutar, t.odeme_turu, t.odeyen, t.aciklama, t.iptal, t.iptal_nedeni,
            d.id AS daire_id, d.site_id, si.ad AS site, si.adres AS site_adres, d.daire_no, d.blok, f.ad AS firma
       FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id JOIN siteler si ON si.id = d.site_id JOIN firmalar f ON f.id = t.firma_id
      WHERE t.id = $1 AND t.firma_id = $2`, [id, ctx.firma_id]);
  if (!t) throw v.hata('Makbuz bulunamadı.', 404);
  siteDenetle(ctx, t.site_id, 'Makbuz');
  const { rows: kalemler } = await c.query(
    `SELECT b.tur, b.donem, b.aciklama, ad.tutar FROM aidat_dagilimi ad JOIN aidat_borclari b ON b.id = ad.borc_id WHERE ad.tahsilat_id = $1 ORDER BY b.vade, b.id`, [id]);
  const kapanan = kalemler.reduce((s, x) => s + kurus(x.tutar), 0);
  return { ...t, yaziyla: yaziyla(t.tutar), kalemler, avans: tl(kurus(t.tutar) - kapanan) };
}

// ---------- Borçlar ----------

// Her borç satırı: ödenen, kalan, durum, gecikme günü ve hesaplanan gecikme tazminatı.
function borcSorgusu() {
  return `
    WITH f AS (SELECT gecikme_gun, yaklasan_gun FROM firmalar WHERE id = $1)
    SELECT * FROM (
      SELECT b.id, b.daire_id, b.tur, b.donem, b.vade, b.tutar, b.aciklama, b.toplama_id,
             d.site_id, si.ad AS site, d.daire_no, d.blok,
             COALESCE(o.odenen, 0) AS odenen, b.tutar - COALESCE(o.odenen, 0) AS kalan, o.son_odeme,
             CASE WHEN b.tutar - COALESCE(o.odenen, 0) <= 0 THEN 'Ödendi'
                  WHEN CURRENT_DATE - b.vade > f.gecikme_gun THEN 'Gecikti'
                  WHEN COALESCE(o.odenen, 0) > 0 THEN 'Kısmi Ödendi'
                  ELSE 'Bekliyor' END AS durum,
             CASE WHEN b.tutar - COALESCE(o.odenen, 0) > 0 THEN GREATEST(0, CURRENT_DATE - b.vade) ELSE 0 END AS gecikme_gun,
             CASE WHEN b.tutar - COALESCE(o.odenen, 0) > 0 AND CURRENT_DATE - b.vade > f.gecikme_gun
                  THEN round((b.tutar - COALESCE(o.odenen, 0)) * si.gecikme_orani / 100 * (CURRENT_DATE - b.vade) / 30, 2) ELSE 0 END AS tazminat,
             (b.tutar - COALESCE(o.odenen, 0) > 0 AND b.vade >= CURRENT_DATE AND b.vade - CURRENT_DATE <= f.yaklasan_gun) AS yaklasan
        FROM aidat_borclari b CROSS JOIN f
        JOIN daireler d ON d.id = b.daire_id
        JOIN siteler si ON si.id = d.site_id
        LEFT JOIN LATERAL (SELECT sum(ad.tutar) AS odenen, max(t.tarih) AS son_odeme
                             FROM aidat_dagilimi ad JOIN aidat_tahsilatlari t ON t.id = ad.tahsilat_id WHERE ad.borc_id = b.id) o ON true
       WHERE b.firma_id = $1 AND NOT b.iptal) x`;
}

async function borclar(c, ctx, q = {}) {
  const donem = q.donem ? v.donem(q.donem) : null;
  const durum = q.durum ? v.secim(q.durum, 'Durum', ['Ödendi', 'Gecikti', 'Kısmi Ödendi', 'Bekliyor', 'Açık']) : null;
  const daireId = v.kimlik(q.daire_id, 'Daire', { zorunlu: false });
  const { rows } = await c.query(
    `${borcSorgusu()} WHERE ($2::text IS NULL OR donem = $2)
        AND ($3::text IS NULL OR durum = $3 OR ($3 = 'Açık' AND kalan > 0))
        AND ($4::bigint IS NULL OR daire_id = $4) AND ($5::bigint[] IS NULL OR site_id = ANY($5))
      ORDER BY vade DESC, site, blok NULLS FIRST, NULLIF(substring(daire_no from '^[0-9]+'), '')::int NULLS LAST, daire_no LIMIT 5000`,
    [ctx.firma_id, donem, durum, daireId, siteFiltresi(ctx, q)]);
  return rows;
}

async function borcIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Borç');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [b0] } = await c.query('SELECT b.id, d.site_id FROM aidat_borclari b JOIN daireler d ON d.id = b.daire_id WHERE b.id = $1 AND b.firma_id = $2', [id, ctx.firma_id]);
  if (!b0) throw v.hata('İptal edilecek borç bulunamadı.', 404);
  siteDenetle(ctx, b0.site_id, 'Borç');
  const { rows: [b] } = await c.query(
    `UPDATE aidat_borclari SET iptal = true, aciklama = left(COALESCE(aciklama, '') || ' / İptal: ' || $2, 500)
      WHERE id = $1 AND NOT iptal RETURNING daire_id, donem, tutar, tur`, [id, neden]);
  if (!b) throw v.hata('Borç zaten iptal edilmiş.', 409);
  await dagit(c, b.daire_id);
  await kayitYaz(c, ctx, 'Aidat borcu iptal edildi', `${b.tur} ${b.donem} ${paraMetni(b.tutar)} / ${neden}`);
  return { id };
}

// Dairenin oturanı: aktif kiracı varsa kiracı, yoksa malik oturuyorsa malik. Hatırlatma ona gider.
const OTURAN = `
  LEFT JOIN kisiler ml ON ml.id = d.ev_sahibi_id
  LEFT JOIN LATERAL (SELECT k.ad_soyad, k.telefon FROM sozlesmeler s JOIN kisiler k ON k.id = s.kisi_id WHERE s.daire_id = d.id AND s.durum = 'Aktif' LIMIT 1) ki ON true`;

// Dairenin aidat cari hesabı: borçlar, tahsilatlar, bakiye, avans, tazminat.
async function daireHesabi(c, ctx, daireId) {
  const d0 = await daireBul(c, ctx, daireId);
  const { rows: [d] } = await c.query(
    `SELECT d.id, d.site_id, si.ad AS site, d.daire_no, d.blok, d.kat, d.metrekare, d.arsa_payi, d.aidat_ozel, d.tip,
            ml.ad_soyad AS malik, ml.telefon AS malik_telefon, ki.ad_soyad AS kiraci, ki.telefon AS kiraci_telefon, d.ev_sahibi_oturuyor
       FROM daireler d JOIN siteler si ON si.id = d.site_id ${OTURAN} WHERE d.id = $1`, [d0.id]);
  const b = await borclar(c, ctx, { daire_id: d0.id });
  const t = await tahsilatlar(c, ctx, { daire_id: d0.id });
  const toplamBorc = b.reduce((s, x) => s + kurus(x.tutar), 0);
  const odenen = t.filter((x) => !x.iptal).reduce((s, x) => s + kurus(x.tutar), 0);
  return {
    ...d, borclar: b, tahsilatlar: t,
    bakiye: tl(Math.max(toplamBorc - odenen, 0)), avans: tl(Math.max(odenen - toplamBorc, 0)),
    tazminat: tl(b.reduce((s, x) => s + kurus(x.tazminat), 0)),
  };
}

// ---------- Borçlular (gecikenler) ----------

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const donemAdi = (x) => `${AY_ADLARI[Number(x.slice(5, 7)) - 1]} ${x.slice(0, 4)}`;

function hatirlatmaMetni(g, firmaAd) {
  const donemler = [...new Set(g.donemler)].map(donemAdi).join(', ');
  const tutar = paraMetni(g.geciken_tutar).replace(' ₺', ' TL');
  return `Sayın ${g.muhatap || 'Kat Maliki'}, ${g.site} ${daireAdi(g)} için ${donemler} dönemine ait toplam ${tutar} aidat ödemeniz ` +
    `${g.gecikme_gun} gündür gecikmiştir.${g.iban ? ` Ödemenizi ${g.iban.replace(/(.{4})(?=.)/g, '$1 ')} numaralı yönetim hesabına` : ' Ödemenizi'} en kısa sürede yapmanızı rica ederiz. ` +
    `${g.site} Yönetimi / ${firmaAd}`;
}

async function borclular(c, ctx, q = {}) {
  const { rows } = await c.query(`${borcSorgusu()} WHERE durum = 'Gecikti' AND ($2::bigint[] IS NULL OR site_id = ANY($2)) ORDER BY vade`,
    [ctx.firma_id, siteFiltresi(ctx, q)]);
  if (!rows.length) return [];
  const { rows: [f] } = await c.query('SELECT ad FROM firmalar WHERE id = $1', [ctx.firma_id]);
  const { rows: kisiler } = await c.query(
    `SELECT d.id, si.iban, (SELECT max(t.tarih) FROM aidat_tahsilatlari t WHERE t.daire_id = d.id AND NOT t.iptal) AS son_odeme, ml.ad_soyad AS malik, ml.telefon AS malik_telefon, ki.ad_soyad AS kiraci, ki.telefon AS kiraci_telefon
       FROM daireler d JOIN siteler si ON si.id = d.site_id ${OTURAN} WHERE d.id = ANY($1)`, [[...new Set(rows.map((r) => r.daire_id))]]);
  const kisi = new Map(kisiler.map((k) => [k.id, k]));
  const grup = new Map();
  for (const b of rows) {
    const k = kisi.get(b.daire_id) || {};
    const g = grup.get(b.daire_id) || {
      daire_id: b.daire_id, site_id: b.site_id, site: b.site, daire_no: b.daire_no, blok: b.blok, iban: k.iban,
      malik: k.malik, malik_telefon: k.malik_telefon, kiraci: k.kiraci, kiraci_telefon: k.kiraci_telefon,
      muhatap: k.kiraci || k.malik, telefon: k.kiraci_telefon || k.malik_telefon,
      geciken_tutar: 0, tazminat: 0, gecikme_gun: 0, donemler: [], son_odeme: k.son_odeme || null,
    };
    g.geciken_tutar = tl(kurus(g.geciken_tutar) + kurus(b.kalan));
    g.tazminat = tl(kurus(g.tazminat) + kurus(b.tazminat));
    g.gecikme_gun = Math.max(g.gecikme_gun, b.gecikme_gun);
    g.donemler.push(b.donem);
    grup.set(b.daire_id, g);
  }
  return [...grup.values()].sort((a, b) => b.gecikme_gun - a.gecikme_gun).map((g) => {
    const mesaj = hatirlatmaMetni(g, f.ad);
    const tel = (g.telefon || '').replace(/\D/g, '').replace(/^0/, '90');
    return { ...g, mesaj, whatsapp: tel.length >= 11 ? `https://wa.me/${tel}?text=${encodeURIComponent(mesaj)}` : null };
  });
}

// ---------- Giderler ve kasa ----------

async function giderEkle(c, ctx, g) {
  const s = await siteBul(c, ctx, g.site_id);
  const tarih = v.tarih(g.tarih, 'Tarih');
  const kategori = v.metin(g.kategori, 'Kategori', { zorunlu: true, max: 60 });
  const tutar = v.tutar(g.tutar, 'Tutar', { pozitif: true });
  const odeme = v.secim(g.odeme_turu, 'Ödeme türü', v.ODEME_TURLERI, { varsayilan: 'Havale/EFT' });
  const aciklama = v.metin(g.aciklama, 'Açıklama', { max: 500 });
  const belge = v.metin(g.belge_no, 'Belge no', { max: 60 });
  const { rows: [r] } = await c.query(
    `INSERT INTO giderler (firma_id, site_id, tarih, kategori, aciklama, tutar, odeme_turu, belge_no, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [ctx.firma_id, s.id, tarih, kategori, aciklama, tutar, odeme, belge, ctx.kullanici_id || null]);
  await kayitYaz(c, ctx, 'Gider eklendi', `${s.ad}: ${kategori} ${paraMetni(tutar)}`);
  return { id: r.id };
}

async function giderIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Gider');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [x] } = await c.query('SELECT id, site_id, kategori, tutar FROM giderler WHERE id = $1 AND firma_id = $2 AND NOT iptal', [id, ctx.firma_id]);
  if (!x) throw v.hata('İptal edilecek gider bulunamadı.', 404);
  siteDenetle(ctx, x.site_id, 'Gider');
  await c.query('UPDATE giderler SET iptal = true, iptal_nedeni = $2 WHERE id = $1', [id, neden]);
  await kayitYaz(c, ctx, 'Gider iptal edildi', `${x.kategori} ${paraMetni(x.tutar)} / ${neden}`);
  return { id };
}

async function giderler(c, ctx, q = {}) {
  const b = v.tarih(q.baslangic, 'Başlangıç', { zorunlu: false });
  const s = v.tarih(q.bitis, 'Bitiş', { zorunlu: false });
  const { rows } = await c.query(
    `SELECT g.id, g.site_id, si.ad AS site, g.tarih, g.kategori, g.aciklama, g.tutar, g.odeme_turu, g.belge_no, g.iptal, g.iptal_nedeni
       FROM giderler g JOIN siteler si ON si.id = g.site_id
      WHERE g.firma_id = $1 AND ($2::date IS NULL OR g.tarih >= $2) AND ($3::date IS NULL OR g.tarih <= $3) AND ($4::bigint[] IS NULL OR g.site_id = ANY($4))
      ORDER BY g.tarih DESC, g.id DESC LIMIT 2000`, [ctx.firma_id, b, s, siteFiltresi(ctx, q)]);
  return rows;
}

// Gelir-gider: dönem aralığında site bazında tahsilat, gider ve kasa (açılıştan bugüne tahsilat − gider).
async function gelirGider(c, ctx, q = {}) {
  const bas = q.baslangic ? v.tarih(q.baslangic, 'Başlangıç') : `${bugun().slice(0, 4)}-01-01`;
  const bit = q.bitis ? v.tarih(q.bitis, 'Bitiş') : bugun();
  if (bit < bas) throw v.hata('Bitiş tarihi başlangıçtan önce olamaz.');
  const siteler = siteFiltresi(ctx, q);
  const { rows } = await c.query(
    `SELECT si.id AS site_id, si.ad AS site,
            COALESCE((SELECT sum(t.tutar) FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id WHERE d.site_id = si.id AND NOT t.iptal AND t.tarih BETWEEN $2 AND $3), 0) AS gelir,
            COALESCE((SELECT sum(g.tutar) FROM giderler g WHERE g.site_id = si.id AND NOT g.iptal AND g.tarih BETWEEN $2 AND $3), 0) AS gider,
            COALESCE((SELECT sum(t.tutar) FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id WHERE d.site_id = si.id AND NOT t.iptal AND t.tarih <= $3), 0)
          - COALESCE((SELECT sum(g.tutar) FROM giderler g WHERE g.site_id = si.id AND NOT g.iptal AND g.tarih <= $3), 0) AS kasa
       FROM siteler si WHERE si.firma_id = $1 AND ($4::bigint[] IS NULL OR si.id = ANY($4)) ORDER BY si.aktif DESC, si.ad`, [ctx.firma_id, bas, bit, siteler]);
  const { rows: kategoriler } = await c.query(
    `SELECT g.kategori, sum(g.tutar) AS tutar FROM giderler g
      WHERE g.firma_id = $1 AND NOT g.iptal AND g.tarih BETWEEN $2 AND $3 AND ($4::bigint[] IS NULL OR g.site_id = ANY($4))
      GROUP BY g.kategori ORDER BY sum(g.tutar) DESC`, [ctx.firma_id, bas, bit, siteler]);
  const top = (a) => tl(rows.reduce((s, r) => s + kurus(r[a]), 0));
  return { baslangic: bas, bitis: bit, siteler: rows.map((r) => ({ ...r, fark: tl(kurus(r.gelir) - kurus(r.gider)) })), kategoriler,
    toplam: { gelir: top('gelir'), gider: top('gider'), kasa: top('kasa'), fark: tl(kurus(top('gelir')) - kurus(top('gider'))) } };
}

// ---------- Özet ----------

async function ozet(c, ctx, q = {}) {
  const ay = buAy();
  const siteler = siteFiltresi(ctx, q);
  const { rows: [k] } = await c.query(
    `WITH b AS (${borcSorgusu()})
     SELECT COALESCE(sum(tutar) FILTER (WHERE donem = $2), 0) AS bu_ay_beklenen,
            COALESCE(sum(odenen) FILTER (WHERE donem = $2), 0) AS bu_ay_odenen,
            COALESCE(sum(kalan) FILTER (WHERE donem = $2), 0) AS bu_ay_kalan,
            COALESCE(sum(kalan) FILTER (WHERE durum = 'Gecikti'), 0) AS geciken_toplam,
            COALESCE(sum(tazminat), 0) AS tazminat_toplam,
            count(DISTINCT daire_id) FILTER (WHERE durum = 'Gecikti')::int AS borclu_daire,
            COALESCE(sum(kalan) FILTER (WHERE kalan > 0), 0) AS toplam_alacak
       FROM b WHERE ($3::bigint[] IS NULL OR site_id = ANY($3))`, [ctx.firma_id, ay, siteler]);
  const { rows: [t] } = await c.query(
    `SELECT COALESCE((SELECT sum(t.tutar) FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id
                       WHERE t.firma_id = $1 AND NOT t.iptal AND to_char(t.tarih, 'YYYY-MM') = $2 AND ($3::bigint[] IS NULL OR d.site_id = ANY($3))), 0) AS bu_ay_tahsilat,
            COALESCE((SELECT sum(g.tutar) FROM giderler g
                       WHERE g.firma_id = $1 AND NOT g.iptal AND to_char(g.tarih, 'YYYY-MM') = $2 AND ($3::bigint[] IS NULL OR g.site_id = ANY($3))), 0) AS bu_ay_gider,
            COALESCE((SELECT sum(t.tutar) FROM aidat_tahsilatlari t JOIN daireler d ON d.id = t.daire_id
                       WHERE t.firma_id = $1 AND NOT t.iptal AND ($3::bigint[] IS NULL OR d.site_id = ANY($3))), 0)
          - COALESCE((SELECT sum(g.tutar) FROM giderler g WHERE g.firma_id = $1 AND NOT g.iptal AND ($3::bigint[] IS NULL OR g.site_id = ANY($3))), 0) AS kasa`,
    [ctx.firma_id, ay, siteler]);
  const { rows: [d] } = await c.query(
    `SELECT count(*) FILTER (WHERE d.aktif)::int AS daire,
            count(*) FILTER (WHERE d.aktif AND EXISTS (SELECT 1 FROM sozlesmeler s WHERE s.daire_id = d.id AND s.durum = 'Aktif'))::int AS kiraci,
            count(*) FILTER (WHERE d.aktif AND d.ev_sahibi_oturuyor)::int AS malik
       FROM daireler d WHERE d.firma_id = $1 AND ($2::bigint[] IS NULL OR d.site_id = ANY($2))`, [ctx.firma_id, siteler]);
  const tahsilOrani = k.bu_ay_beklenen > 0 ? Math.round((k.bu_ay_odenen / k.bu_ay_beklenen) * 1000) / 10 : 0;
  return { donem: ay, ...k, ...t, tahsil_orani: tahsilOrani, daire: d.daire, daire_kiraci: d.kiraci, daire_malik: d.malik, daire_bos: d.daire - d.kiraci - d.malik };
}

// Sunucu saat başı çağırır: bütün aktif firmalar için bu ayın aidat borçlarını yazar (çift kayıt oluşmaz).
async function otomatikTahakkuk(pool, islem) {
  const { rows } = await pool.query('SELECT id FROM firmalar WHERE aktif');
  let toplam = 0;
  for (const f of rows) {
    const r = await islem(pool, (c) => tahakkuk(c, { firma_id: f.id, kullanici_id: null, siteler: null }, { donem: buAy() }));
    toplam += r.olusan;
  }
  return toplam;
}

module.exports = {
  bugun, buAy, YONTEMLER, GIDER_KATEGORILERI, aidatPaylari, paylastir, yaziyla, vadeTarihi,
  aidatPlani, aidatPlaniKaydet, daireAidatKaydet, tahakkuk, dagit,
  ekToplamaEkle, ekToplamalar, ekToplamaIptal,
  tahsilatEkle, tahsilatIptal, tahsilatlar, makbuz,
  borclar, borcIptal, daireHesabi, borclular,
  giderEkle, giderIptal, giderler, gelirGider, ozet, otomatikTahakkuk,
};
