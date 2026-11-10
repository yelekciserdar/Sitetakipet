'use strict';
// Kira iş kuralları: daireler, sözleşmeler, aylık borç (tahakkuk), tahsilat ve dağıtımı, takip, gecikenler, özet, rapor.
const v = require('./dogrula');
const { kayitYaz, paraMetni, kisiEkle } = require('./cekirdek');
const { siteFiltresi, siteDenetle, siteBul } = require('./site');
const { ibanNormal } = require('./ekstre');

const kurus = (n) => Math.round(Number(n) * 100);
const tl = (k) => k / 100;
function bugun() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}
const buAy = () => bugun().slice(0, 7);
const daireAdi = (d) => (d.blok ? `${d.blok} Blok ${d.daire_no}` : d.daire_no);
const tamAd = (d) => (d.site ? `${d.site} ${daireAdi(d)}` : daireAdi(d));

// ---------- Daireler ----------

async function daireler(c, ctx, q = {}) {
  const siteler = siteFiltresi(ctx, q);
  const { rows } = await c.query(
    `WITH f AS (SELECT gecikme_gun FROM firmalar WHERE id = $1)
     SELECT d.id, d.site_id, si.ad AS site, d.daire_no, d.blok, d.kat, d.metrekare, d.oda, d.tip, d.adres, d.notlar, d.aktif,
            d.ev_sahibi_oturuyor, d.ev_sahibi_id, es.ad_soyad AS ev_sahibi_ad, es.telefon AS ev_sahibi_telefon, es.eposta AS ev_sahibi_eposta, es.iban AS ev_sahibi_iban,
            s.id AS sozlesme_id, s.aylik_kira, s.odeme_gunu, k.id AS kisi_id, k.ad_soyad, k.telefon,
            COALESCE(b.acik, 0) AS acik_borc, COALESCE(b.geciken, 0) AS geciken_tutar, COALESCE(b.gecikme_gun, 0) AS gecikme_gun,
            (SELECT max(t.tarih) FROM tahsilatlar t WHERE t.sozlesme_id = s.id AND NOT t.iptal) AS son_odeme
       FROM daireler d CROSS JOIN f
       JOIN siteler si ON si.id = d.site_id
       LEFT JOIN kisiler es ON es.id = d.ev_sahibi_id
       LEFT JOIN sozlesmeler s ON s.daire_id = d.id AND s.durum = 'Aktif'
       LEFT JOIN kisiler k ON k.id = s.kisi_id
       LEFT JOIN LATERAL (
         SELECT sum(x.kalan) AS acik,
                sum(x.kalan) FILTER (WHERE CURRENT_DATE - x.vade > f.gecikme_gun) AS geciken,
                max(CURRENT_DATE - x.vade) FILTER (WHERE CURRENT_DATE - x.vade > f.gecikme_gun) AS gecikme_gun
           FROM (SELECT kb.vade, kb.tutar - COALESCE((SELECT sum(od.tutar) FROM odeme_dagilimi od WHERE od.borc_id = kb.id), 0) AS kalan
                   FROM kira_borclari kb WHERE kb.sozlesme_id = s.id AND NOT kb.iptal) x
          WHERE x.kalan > 0) b ON true
      WHERE d.firma_id = $1 AND ($2::bigint[] IS NULL OR d.site_id = ANY($2))
      ORDER BY d.aktif DESC, si.ad, d.blok NULLS FIRST, NULLIF(substring(d.daire_no from '^[0-9]+'), '')::int NULLS LAST, d.daire_no`, [ctx.firma_id, siteler]);
  return rows.map((d) => ({ ...d, durum: daireDurumu(d) }));
}

// Oturum durumu: Kiracılı (aktif sözleşme), Ev sahibi (sahibi oturuyor), Boş; kullanım dışı daire Pasif.
function daireDurumu(d) {
  if (!d.aktif) return 'Pasif';
  if (d.sozlesme_id) return 'Kiracılı';
  return d.ev_sahibi_oturuyor ? 'Ev sahibi' : 'Boş';
}

function daireAlanlari(g) {
  const m2 = g.metrekare === undefined || g.metrekare === null || g.metrekare === '' ? null : v.tutar(g.metrekare, 'Metrekare', { pozitif: true });
  return {
    daire_no: v.metin(g.daire_no, 'Daire no', { zorunlu: true, max: 30 }),
    blok: v.metin(g.blok, 'Blok', { max: 30 }),
    kat: v.metin(g.kat === undefined || g.kat === null ? g.kat : String(g.kat), 'Kat', { max: 10 }),
    metrekare: m2,
    oda: v.metin(g.oda, 'Oda sayısı', { max: 20 }),
    tip: v.secim(g.tip, 'Daire tipi', ['Konut', 'İşyeri', 'Depo', 'Diğer'], { varsayilan: 'Konut' }),
    adres: v.metin(g.adres, 'Adres', { max: 500 }),
    notlar: v.metin(g.notlar, 'Not', { max: 2000 }),
  };
}
function daireCakismasi(e) {
  if (e.code === '23505') throw v.hata('Bu sitede aynı blok ve numarada bir daire zaten var.', 409);
  throw e;
}

// Ev sahibi kartı: verilmezse (undefined) dokunulmaz; null ya da adı boşsa bağ kaldırılır;
// varsa mevcut kart güncellenir (yalnız ad, telefon, e-posta, IBAN; kişinin kiracılık bilgilerine dokunulmaz), yoksa yeni kart açılır.
async function evSahibiYaz(c, ctx, mevcutId, g) {
  if (g === undefined) return mevcutId;
  if (g === null || typeof g !== 'object' || !String(g.ad_soyad || '').trim()) return null;
  const ad = v.metin(g.ad_soyad, 'Ev sahibi adı', { zorunlu: true, max: 120 });
  const tel = v.metin(g.telefon, 'Ev sahibi telefonu', { max: 30 });
  const eposta = v.metin(g.eposta, 'Ev sahibi e-postası', { max: 200 });
  const ibanHam = v.metin(g.iban, 'Ev sahibi IBAN', { max: 50 });
  const iban = ibanHam ? ibanNormal(ibanHam) : null;
  if (iban && (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) || (iban.startsWith('TR') && iban.length !== 26))) throw v.hata('Ev sahibi IBAN\'ı geçersiz.');
  if (mevcutId) {
    await c.query('UPDATE kisiler SET ad_soyad = $1, telefon = $2, eposta = $3, iban = $4 WHERE id = $5 AND firma_id = $6', [ad, tel, eposta, iban, mevcutId, ctx.firma_id]);
    return mevcutId;
  }
  const { rows: [k] } = await c.query('INSERT INTO kisiler (firma_id, ad_soyad, telefon, eposta, iban) VALUES ($1, $2, $3, $4, $5) RETURNING id', [ctx.firma_id, ad, tel, eposta, iban]);
  return k.id;
}

// Site seçilmezse ve firmanın tek aktif sitesi varsa daire ona eklenir.
async function daireSitesi(c, ctx, siteId) {
  if (siteId === undefined || siteId === null || siteId === '') {
    const { rows } = await c.query('SELECT id FROM siteler WHERE firma_id = $1 AND aktif ORDER BY id', [ctx.firma_id]);
    if (rows.length !== 1) throw v.hata('Site seçilmeli.');
    siteId = rows[0].id;
  }
  const site = await siteBul(c, ctx, siteId);
  if (!site.aktif) throw v.hata('Pasif siteye daire eklenemez.');
  return site;
}

async function daireEkle(c, ctx, g) {
  const d = daireAlanlari(g);
  const site = await daireSitesi(c, ctx, g.site_id);
  const evSahibiId = await evSahibiYaz(c, ctx, null, g.ev_sahibi);
  const oturuyor = v.mantiksal(g.ev_sahibi_oturuyor);
  const { rows: [r] } = await c.query(
    `INSERT INTO daireler (firma_id, site_id, daire_no, blok, kat, metrekare, oda, tip, adres, notlar, ev_sahibi_id, ev_sahibi_oturuyor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [ctx.firma_id, site.id, d.daire_no, d.blok, d.kat, d.metrekare, d.oda, d.tip, d.adres, d.notlar, evSahibiId, oturuyor]).catch(daireCakismasi);
  await kayitYaz(c, ctx, 'Daire eklendi', `${site.ad} ${daireAdi(d)}`);
  return { id: r.id };
}

async function daireGuncelle(c, ctx, id, g) {
  id = v.kimlik(id, 'Daire');
  const d = daireAlanlari(g);
  const { rows: [eski] } = await c.query('SELECT aktif, site_id, ev_sahibi_id, ev_sahibi_oturuyor FROM daireler WHERE id = $1 AND firma_id = $2 FOR UPDATE', [id, ctx.firma_id]);
  if (!eski) throw v.hata('Daire bulunamadı.', 404);
  siteDenetle(ctx, eski.site_id, 'Daire');
  const siteId = g.site_id === undefined || Number(g.site_id) === eski.site_id ? eski.site_id : (await daireSitesi(c, ctx, g.site_id)).id;
  const aktif = v.mantiksal(g.aktif, { varsayilan: eski.aktif });
  const oturuyor = v.mantiksal(g.ev_sahibi_oturuyor, { varsayilan: eski.ev_sahibi_oturuyor });
  if (!aktif || (oturuyor && !eski.ev_sahibi_oturuyor)) {
    const { rows: [s] } = await c.query(`SELECT 1 FROM sozlesmeler WHERE daire_id = $1 AND durum = 'Aktif'`, [id]);
    if (s) throw v.hata('Dairede aktif kiracı var; önce kiracıyı "Ayrıldı" yapın.', 409);
  }
  const evSahibiId = await evSahibiYaz(c, ctx, eski.ev_sahibi_id, g.ev_sahibi);
  await c.query(
    `UPDATE daireler SET daire_no = $1, blok = $2, kat = $3, metrekare = $4, oda = $5, tip = $6, adres = $7, notlar = $8, aktif = $9, site_id = $10,
            ev_sahibi_id = $11, ev_sahibi_oturuyor = $12
      WHERE id = $13`, [d.daire_no, d.blok, d.kat, d.metrekare, d.oda, d.tip, d.adres, d.notlar, aktif, siteId, evSahibiId, oturuyor && aktif, id]).catch(daireCakismasi);
  await kayitYaz(c, ctx, 'Daire güncellendi', `${daireAdi(d)}${aktif ? '' : ' (pasif)'}`);
  return { id };
}

// ---------- Sözleşmeler ----------

const SOZ_SECIM = `
  SELECT s.id, s.daire_id, d.site_id, si.ad AS site, d.daire_no, d.blok, es.ad_soyad AS ev_sahibi_ad, es.telefon AS ev_sahibi_telefon, s.kisi_id, k.ad_soyad, k.telefon, s.baslangic, s.bitis, s.aylik_kira, s.depozito,
         s.odeme_gunu, s.durum, s.ayrilis_tarihi, s.notlar,
         COALESCE((SELECT sum(kb.tutar) FROM kira_borclari kb WHERE kb.sozlesme_id = s.id AND NOT kb.iptal), 0) AS toplam_borc,
         COALESCE((SELECT sum(t.tutar) FROM tahsilatlar t WHERE t.sozlesme_id = s.id AND NOT t.iptal), 0) AS toplam_odeme
    FROM sozlesmeler s JOIN daireler d ON d.id = s.daire_id JOIN siteler si ON si.id = d.site_id JOIN kisiler k ON k.id = s.kisi_id
    LEFT JOIN kisiler es ON es.id = d.ev_sahibi_id`;

function sozlesmeHesap(s) {
  const fark = kurus(s.toplam_borc) - kurus(s.toplam_odeme);
  return { ...s, bakiye: tl(Math.max(fark, 0)), avans: tl(Math.max(-fark, 0)) };
}

async function sozlesmeler(c, ctx, q = {}) {
  const durum = q.durum ? v.secim(q.durum, 'Durum', ['Aktif', 'Ayrıldı']) : null;
  const siteler = siteFiltresi(ctx, q);
  const { rows } = await c.query(`${SOZ_SECIM} WHERE s.firma_id = $1 AND ($2::text IS NULL OR s.durum = $2) AND ($3::bigint[] IS NULL OR d.site_id = ANY($3))
     ORDER BY s.durum, si.ad, d.blok NULLS FIRST, NULLIF(substring(d.daire_no from '^[0-9]+'), '')::int NULLS LAST, d.daire_no`, [ctx.firma_id, durum, siteler]);
  return rows.map(sozlesmeHesap);
}

async function sozlesme(c, ctx, id) {
  id = v.kimlik(id, 'Sözleşme');
  const { rows: [s] } = await c.query(`${SOZ_SECIM} WHERE s.id = $1 AND s.firma_id = $2`, [id, ctx.firma_id]);
  if (!s) throw v.hata('Sözleşme bulunamadı.', 404);
  siteDenetle(ctx, s.site_id, 'Sözleşme');
  const borclar = await borcListesi(c, ctx, { sozlesme_id: id });
  const { rows: tahsilatlar } = await c.query(
    `SELECT id, tarih, tutar, odeme_turu, kaynak, aciklama, iptal, iptal_nedeni FROM tahsilatlar WHERE sozlesme_id = $1 ORDER BY tarih DESC, id DESC`, [id]);
  return { ...sozlesmeHesap(s), borclar, tahsilatlar };
}

function sozlesmeAlanlari(g, firma) {
  const baslangic = v.tarih(g.baslangic, 'Sözleşme başlangıcı');
  const bitis = v.tarih(g.bitis, 'Sözleşme bitişi', { zorunlu: false });
  if (bitis && bitis < baslangic) throw v.hata('Sözleşme bitişi başlangıçtan önce olamaz.');
  const gun = g.odeme_gunu === undefined || g.odeme_gunu === null || g.odeme_gunu === '' ? firma.varsayilan_odeme_gunu : Number(g.odeme_gunu);
  if (!Number.isInteger(gun) || gun < 1 || gun > 31) throw v.hata('Ödeme günü 1–31 arasında olmalı.');
  return {
    baslangic, bitis, odeme_gunu: gun,
    aylik_kira: v.tutar(g.aylik_kira, 'Aylık kira', { pozitif: true }),
    depozito: v.tutar(g.depozito, 'Depozito', { zorunlu: false }),
    notlar: v.metin(g.notlar, 'Not', { max: 2000 }),
  };
}

// Yeni kiracı: daire boş olmalı. Kişi kartı verilmezse aynı istekteki bilgilerle açılır.
// Sözleşme bu ayı kapsıyorsa bu ayın borcu hemen oluşur; geçmiş aylar için Kira Takibi'nden dönem seçilerek oluşturulur.
async function sozlesmeEkle(c, ctx, g) {
  const daireId = v.kimlik(g.daire_id, 'Daire');
  const { rows: [d] } = await c.query('SELECT id, daire_no, blok, aktif, site_id, ev_sahibi_oturuyor FROM daireler WHERE id = $1 AND firma_id = $2 FOR UPDATE', [daireId, ctx.firma_id]);
  if (!d) throw v.hata('Daire bulunamadı.', 404);
  siteDenetle(ctx, d.site_id, 'Daire');
  if (!d.aktif) throw v.hata('Pasif daireye kiracı eklenemez.');
  const { rows: [f] } = await c.query('SELECT varsayilan_odeme_gunu FROM firmalar WHERE id = $1', [ctx.firma_id]);
  const s = sozlesmeAlanlari(g, f);
  let kisiId = v.kimlik(g.kisi_id, 'Kiracı', { zorunlu: false });
  if (kisiId) {
    const { rows: [k] } = await c.query('SELECT id FROM kisiler WHERE id = $1 AND firma_id = $2', [kisiId, ctx.firma_id]);
    if (!k) throw v.hata('Kiracı bulunamadı.', 404);
  } else {
    kisiId = (await kisiEkle(c, ctx, g.kisi || {})).id;
  }
  const { rows: [r] } = await c.query(
    `INSERT INTO sozlesmeler (firma_id, daire_id, kisi_id, baslangic, bitis, aylik_kira, depozito, odeme_gunu, notlar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ctx.firma_id, daireId, kisiId, s.baslangic, s.bitis, s.aylik_kira, s.depozito, s.odeme_gunu, s.notlar])
    .catch((e) => { if (e.code === '23505') throw v.hata('Bu dairede zaten aktif bir kiracı var.', 409); throw e; });
  // Ev sahibinin oturduğu daire kiraya verildiyse artık "Kiracılı"dır.
  if (d.ev_sahibi_oturuyor) await c.query('UPDATE daireler SET ev_sahibi_oturuyor = false WHERE id = $1', [daireId]);
  await kayitYaz(c, ctx, 'Kiracı daireye yerleşti', `${daireAdi(d)}: ${paraMetni(s.aylik_kira)}/ay, ödeme günü ${s.odeme_gunu}`);
  await tahakkuk(c, ctx, { donem: buAy(), sozlesme_id: r.id, sessiz: true });
  return sozlesme(c, ctx, r.id);
}

// Kira artışı, bitiş tarihi, ödeme günü, not. Yeni kira tutarı yalnız bundan sonra oluşacak borçlara uygulanır;
// "bu_ay_da" true ise bu ayın henüz ödenmemiş borcu da yeni tutara çekilir.
async function sozlesmeGuncelle(c, ctx, id, g) {
  id = v.kimlik(id, 'Sözleşme');
  const { rows: [eski] } = await c.query('SELECT * FROM sozlesmeler WHERE id = $1 AND firma_id = $2 FOR UPDATE', [id, ctx.firma_id]);
  if (!eski) throw v.hata('Sözleşme bulunamadı.', 404);
  if (eski.durum !== 'Aktif') throw v.hata('Ayrılmış kiracının sözleşmesi değiştirilemez.');
  const s = sozlesmeAlanlari({
    baslangic: eski.baslangic, bitis: eski.bitis, aylik_kira: eski.aylik_kira, depozito: eski.depozito,
    odeme_gunu: eski.odeme_gunu, notlar: eski.notlar, ...g,
  }, { varsayilan_odeme_gunu: eski.odeme_gunu });
  await c.query('UPDATE sozlesmeler SET baslangic = $1, bitis = $2, aylik_kira = $3, depozito = $4, odeme_gunu = $5, notlar = $6 WHERE id = $7',
    [s.baslangic, s.bitis, s.aylik_kira, s.depozito, s.odeme_gunu, s.notlar, id]);
  if (v.mantiksal(g.bu_ay_da)) {
    await c.query('UPDATE kira_borclari SET tutar = $1 WHERE sozlesme_id = $2 AND donem = $3 AND NOT iptal AND tutar <> $1', [s.aylik_kira, id, buAy()]);
    await dagit(c, id);
  }
  const degisen = s.aylik_kira !== eski.aylik_kira ? `kira ${paraMetni(eski.aylik_kira)} → ${paraMetni(s.aylik_kira)}` : 'bilgiler';
  await kayitYaz(c, ctx, 'Sözleşme güncellendi', `#${id}: ${degisen}`);
  return sozlesme(c, ctx, id);
}

// Kiracı ayrıldı: sözleşme kapanır, daire boşalır. Ayrılış ayından sonraki borçlar iptal edilir; açık kalan borçlar
// alacak olarak görünmeye devam eder. (Excel'de kira tutarı 0 yapılıyor, geçmiş bilgisi bozuluyordu.)
async function sozlesmeAyril(c, ctx, id, g) {
  id = v.kimlik(id, 'Sözleşme');
  const tarih = v.tarih(g.tarih, 'Ayrılış tarihi', { zorunlu: false }) || bugun();
  const { rows: [s] } = await c.query(
    `SELECT s.*, d.daire_no, d.blok, k.ad_soyad FROM sozlesmeler s JOIN daireler d ON d.id = s.daire_id JOIN kisiler k ON k.id = s.kisi_id
      WHERE s.id = $1 AND s.firma_id = $2 FOR UPDATE OF s`, [id, ctx.firma_id]);
  if (!s) throw v.hata('Sözleşme bulunamadı.', 404);
  if (s.durum !== 'Aktif') throw v.hata('Kiracı zaten ayrılmış.');
  if (tarih < s.baslangic) throw v.hata('Ayrılış tarihi sözleşme başlangıcından önce olamaz.');
  await c.query(`UPDATE sozlesmeler SET durum = 'Ayrıldı', ayrilis_tarihi = $1, bitis = $1 WHERE id = $2`, [tarih, id]);
  const r = await c.query('UPDATE kira_borclari SET iptal = true WHERE sozlesme_id = $1 AND donem > $2 AND NOT iptal', [id, tarih.slice(0, 7)]);
  await dagit(c, id);
  await kayitYaz(c, ctx, 'Kiracı ayrıldı', `${daireAdi(s)} / ${s.ad_soyad} / ${tarih}${r.rowCount ? ` / ${r.rowCount} ileri ay borcu iptal` : ''}`);
  return sozlesme(c, ctx, id);
}

// ---------- Tahakkuk ve dağıtım ----------

// Dönemin kira borçlarını yazar: aktif ve o ayı kapsayan her sözleşmeye bir borç. Vade = ödeme günü
// (ay kısaysa ayın son günü). İki kez çalışsa da çift borç oluşmaz. Avansı olan sözleşmelerde avans hemen düşer.
async function tahakkuk(c, ctx, g) {
  const donem = v.donem(g.donem);
  const sozId = v.kimlik(g.sozlesme_id, 'Sözleşme', { zorunlu: false });
  const { rows } = await c.query(
    `WITH ay AS (SELECT to_date($2 || '-01', 'YYYY-MM-DD') AS bas)
     INSERT INTO kira_borclari (firma_id, sozlesme_id, donem, vade, tutar, aciklama)
     SELECT s.firma_id, s.id, $2,
            make_date(extract(year FROM ay.bas)::int, extract(month FROM ay.bas)::int,
                      LEAST(s.odeme_gunu, extract(day FROM (ay.bas + interval '1 month - 1 day'))::int)),
            s.aylik_kira, 'Aylık kira'
       FROM sozlesmeler s CROSS JOIN ay
      WHERE s.firma_id = $1 AND s.durum = 'Aktif' AND ($3::bigint IS NULL OR s.id = $3)
        AND s.baslangic <= (ay.bas + interval '1 month - 1 day')::date
        AND (s.bitis IS NULL OR s.bitis >= ay.bas)
     ON CONFLICT (sozlesme_id, donem) WHERE NOT iptal DO NOTHING
     RETURNING sozlesme_id`, [ctx.firma_id, donem, sozId]);
  for (const r of rows) await dagit(c, r.sozlesme_id);
  if (!g.sessiz && (rows.length || ctx.kullanici_id)) await kayitYaz(c, ctx, 'Kira borçları oluşturuldu', `${donem}: ${rows.length} borç`);
  return { donem, olusan: rows.length };
}

// Sözleşmenin bütün (iptal edilmemiş) tahsilatlarını, borçlarına en eski vadeden başlayarak yeniden dağıtır.
// Her değişiklikten sonra çağrılır; sonuç her zaman aynıdır (sıra: tahsilat tarihi, borç vadesi).
async function dagit(c, sozlesmeId) {
  await c.query('SELECT id FROM sozlesmeler WHERE id = $1 FOR UPDATE', [sozlesmeId]);
  await c.query('DELETE FROM odeme_dagilimi od USING tahsilatlar t WHERE od.tahsilat_id = t.id AND t.sozlesme_id = $1', [sozlesmeId]);
  const { rows: tah } = await c.query('SELECT id, tutar FROM tahsilatlar WHERE sozlesme_id = $1 AND NOT iptal ORDER BY tarih, id', [sozlesmeId]);
  const { rows: bor } = await c.query('SELECT id, tutar FROM kira_borclari WHERE sozlesme_id = $1 AND NOT iptal ORDER BY vade, id', [sozlesmeId]);
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
    await c.query(`INSERT INTO odeme_dagilimi (tahsilat_id, borc_id, tutar) VALUES ${deger}`, satirlar.flat());
  }
}

// ---------- Tahsilat ----------

async function tahsilatEkle(c, ctx, g, { kaynak = 'Elle', bankaHareketId = null } = {}) {
  const sozId = v.kimlik(g.sozlesme_id, 'Kiracı/sözleşme');
  const tarih = v.tarih(g.tarih, 'Ödeme tarihi');
  if (tarih > bugun()) throw v.hata('Ödeme tarihi ileri bir gün olamaz.');
  const tutar = v.tutar(g.tutar, 'Tutar', { pozitif: true });
  const odeme = v.secim(g.odeme_turu, 'Ödeme türü', v.ODEME_TURLERI, { varsayilan: kaynak === 'Banka' ? 'Havale/EFT' : 'Nakit' });
  const aciklama = v.metin(g.aciklama, 'Açıklama', { max: 500 });
  const { rows: [s] } = await c.query(
    `SELECT s.id, d.daire_no, d.blok, d.site_id, k.ad_soyad FROM sozlesmeler s JOIN daireler d ON d.id = s.daire_id JOIN kisiler k ON k.id = s.kisi_id
      WHERE s.id = $1 AND s.firma_id = $2`, [sozId, ctx.firma_id]);
  if (!s) throw v.hata('Sözleşme bulunamadı.', 404);
  siteDenetle(ctx, s.site_id, 'Sözleşme');
  const { rows: [t] } = await c.query(
    `INSERT INTO tahsilatlar (firma_id, sozlesme_id, tarih, tutar, odeme_turu, kaynak, banka_hareket_id, aciklama, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ctx.firma_id, sozId, tarih, tutar, odeme, kaynak, bankaHareketId, aciklama, ctx.kullanici_id || null]);
  await dagit(c, sozId);
  await kayitYaz(c, ctx, 'Kira ödemesi alındı', `${daireAdi(s)} / ${s.ad_soyad} / ${paraMetni(tutar)}${kaynak === 'Banka' ? ' (banka)' : ''}`);
  return { id: t.id, sozlesme: await sozlesme(c, ctx, sozId) };
}

async function tahsilatIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Tahsilat');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [t] } = await c.query(
    'UPDATE tahsilatlar SET iptal = true, iptal_nedeni = $3 WHERE id = $1 AND firma_id = $2 AND NOT iptal RETURNING sozlesme_id, tutar, banka_hareket_id',
    [id, ctx.firma_id, neden]);
  if (!t) throw v.hata('İptal edilecek tahsilat bulunamadı.', 404);
  if (t.banka_hareket_id) await c.query(`UPDATE banka_hareketleri SET durum = 'Kontrol Gerekli' WHERE id = $1`, [t.banka_hareket_id]);
  await dagit(c, t.sozlesme_id);
  await kayitYaz(c, ctx, 'Kira ödemesi iptal edildi', `#${id} ${paraMetni(t.tutar)} / ${neden}`);
  return { id };
}

async function tahsilatlar(c, ctx, q = {}) {
  const b = v.tarih(q.baslangic, 'Başlangıç', { zorunlu: false });
  const s = v.tarih(q.bitis, 'Bitiş', { zorunlu: false });
  const { rows } = await c.query(
    `SELECT t.id, t.tarih, t.tutar, t.odeme_turu, t.kaynak, t.aciklama, t.iptal, t.iptal_nedeni, t.sozlesme_id,
            d.daire_no, d.blok, si.ad AS site, k.ad_soyad
       FROM tahsilatlar t JOIN sozlesmeler so ON so.id = t.sozlesme_id JOIN daireler d ON d.id = so.daire_id
       JOIN siteler si ON si.id = d.site_id JOIN kisiler k ON k.id = so.kisi_id
      WHERE t.firma_id = $1 AND ($2::date IS NULL OR t.tarih >= $2) AND ($3::date IS NULL OR t.tarih <= $3)
        AND ($4::bigint[] IS NULL OR d.site_id = ANY($4))
      ORDER BY t.tarih DESC, t.id DESC LIMIT 2000`, [ctx.firma_id, b, s, siteFiltresi(ctx, q)]);
  return rows;
}

// ---------- Borç listesi (kira takibi) ----------

function borcSorgusu() {
  return `
    WITH f AS (SELECT gecikme_gun, yaklasan_gun FROM firmalar WHERE id = $1)
    SELECT * FROM (
      SELECT b.id, b.sozlesme_id, b.donem, b.vade, b.tutar, b.aciklama,
             d.id AS daire_id, d.site_id, si.ad AS site, d.daire_no, d.blok, k.id AS kisi_id, k.ad_soyad, k.telefon, s.durum AS sozlesme_durum,
             COALESCE(o.odenen, 0) AS odenen, b.tutar - COALESCE(o.odenen, 0) AS kalan, o.son_odeme,
             CASE WHEN b.tutar - COALESCE(o.odenen, 0) <= 0 THEN 'Ödendi'
                  WHEN CURRENT_DATE - b.vade > f.gecikme_gun THEN 'Gecikti'
                  WHEN COALESCE(o.odenen, 0) > 0 THEN 'Kısmi Ödendi'
                  ELSE 'Bekliyor' END AS durum,
             CASE WHEN b.tutar - COALESCE(o.odenen, 0) > 0 THEN GREATEST(0, CURRENT_DATE - b.vade) ELSE 0 END AS gecikme_gun,
             (b.tutar - COALESCE(o.odenen, 0) > 0 AND b.vade >= CURRENT_DATE AND b.vade - CURRENT_DATE <= f.yaklasan_gun) AS yaklasan
        FROM kira_borclari b CROSS JOIN f
        JOIN sozlesmeler s ON s.id = b.sozlesme_id
        JOIN daireler d ON d.id = s.daire_id
        JOIN siteler si ON si.id = d.site_id
        JOIN kisiler k ON k.id = s.kisi_id
        LEFT JOIN LATERAL (SELECT sum(od.tutar) AS odenen, max(t.tarih) AS son_odeme
                             FROM odeme_dagilimi od JOIN tahsilatlar t ON t.id = od.tahsilat_id WHERE od.borc_id = b.id) o ON true
       WHERE b.firma_id = $1 AND NOT b.iptal) x`;
}

async function borcListesi(c, ctx, q = {}) {
  const donem = q.donem ? v.donem(q.donem) : null;
  const durum = q.durum ? v.secim(q.durum, 'Durum', ['Ödendi', 'Gecikti', 'Kısmi Ödendi', 'Bekliyor', 'Açık']) : null;
  const sozId = v.kimlik(q.sozlesme_id, 'Sözleşme', { zorunlu: false });
  const daireId = v.kimlik(q.daire_id, 'Daire', { zorunlu: false });
  const { rows } = await c.query(
    `${borcSorgusu()} WHERE ($2::text IS NULL OR donem = $2)
        AND ($3::text IS NULL OR durum = $3 OR ($3 = 'Açık' AND kalan > 0))
        AND ($4::bigint IS NULL OR sozlesme_id = $4) AND ($5::bigint IS NULL OR daire_id = $5)
        AND ($6::bigint[] IS NULL OR site_id = ANY($6))
      ORDER BY vade DESC, site, blok NULLS FIRST, NULLIF(substring(daire_no from '^[0-9]+'), '')::int NULLS LAST, daire_no LIMIT 5000`, [ctx.firma_id, donem, durum, sozId, daireId, siteFiltresi(ctx, q)]);
  return rows;
}

async function borcIptal(c, ctx, id, g) {
  id = v.kimlik(id, 'Borç');
  const neden = v.metin(g?.neden, 'İptal nedeni', { zorunlu: true, max: 500 });
  const { rows: [b] } = await c.query(
    `UPDATE kira_borclari SET iptal = true, aciklama = left(COALESCE(aciklama, '') || ' / İptal: ' || $3, 500)
      WHERE id = $1 AND firma_id = $2 AND NOT iptal RETURNING sozlesme_id, donem, tutar`, [id, ctx.firma_id, neden]);
  if (!b) throw v.hata('İptal edilecek borç bulunamadı.', 404);
  await dagit(c, b.sozlesme_id);
  await kayitYaz(c, ctx, 'Kira borcu iptal edildi', `${b.donem} ${paraMetni(b.tutar)} / ${neden}`);
  return { id };
}

// ---------- Gecikenler ----------

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const donemAdi = (d) => `${AY_ADLARI[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

function smsMetni(g, firmaAd) {
  const donemler = g.donemler.map(donemAdi).join(', ');
  return `Sayın ${g.ad_soyad}, ${tamAd(g)} için ${donemler} dönemine ait toplam ${paraMetni(g.geciken_tutar).replace(' ₺', ' TL')} kira ödemeniz ` +
    `${g.gecikme_gun} gündür gecikmiştir. Ödemenizi en kısa sürede yapmanızı rica ederiz. ${firmaAd}`;
}

async function gecikenler(c, ctx, q = {}) {
  const { rows } = await c.query(`${borcSorgusu()} WHERE durum = 'Gecikti' AND ($2::bigint[] IS NULL OR site_id = ANY($2)) ORDER BY vade`,
    [ctx.firma_id, siteFiltresi(ctx, q)]);
  const { rows: [f] } = await c.query('SELECT ad FROM firmalar WHERE id = $1', [ctx.firma_id]);
  const grup = new Map();
  for (const b of rows) {
    const g = grup.get(b.sozlesme_id) || { sozlesme_id: b.sozlesme_id, daire_id: b.daire_id, site_id: b.site_id, site: b.site, daire_no: b.daire_no, blok: b.blok, ad_soyad: b.ad_soyad,
      telefon: b.telefon, sozlesme_durum: b.sozlesme_durum, geciken_tutar: 0, gecikme_gun: 0, donemler: [], son_odeme: null };
    g.geciken_tutar = tl(kurus(g.geciken_tutar) + kurus(b.kalan));
    g.gecikme_gun = Math.max(g.gecikme_gun, b.gecikme_gun);
    g.donemler.push(b.donem);
    if (b.son_odeme && (!g.son_odeme || b.son_odeme > g.son_odeme)) g.son_odeme = b.son_odeme;
    grup.set(b.sozlesme_id, g);
  }
  return [...grup.values()].sort((a, b) => b.gecikme_gun - a.gecikme_gun).map((g) => {
    const sms = smsMetni(g, f.ad);
    const tel = (g.telefon || '').replace(/\D/g, '').replace(/^0/, '90');
    return { ...g, sms, whatsapp: tel.length >= 11 ? `https://wa.me/${tel}?text=${encodeURIComponent(sms)}` : null };
  });
}

// ---------- Özet ----------

async function ozet(c, ctx, q = {}) {
  const y = q.yil === undefined ? Number(bugun().slice(0, 4)) : v.yil(q.yil);
  const ay = buAy();
  const siteler = siteFiltresi(ctx, q);
  const { rows: [k] } = await c.query(
    `WITH b AS (${borcSorgusu()})
     SELECT COALESCE(sum(tutar) FILTER (WHERE donem = $2), 0) AS bu_ay_beklenen,
            COALESCE(sum(odenen) FILTER (WHERE donem = $2), 0) AS bu_ay_odenen,
            COALESCE(sum(kalan) FILTER (WHERE donem = $2), 0) AS bu_ay_kalan,
            COALESCE(sum(kalan) FILTER (WHERE durum = 'Gecikti'), 0) AS geciken_toplam,
            count(DISTINCT sozlesme_id) FILTER (WHERE durum = 'Gecikti')::int AS geciken_kiraci,
            count(*) FILTER (WHERE yaklasan)::int AS yaklasan_sayi,
            COALESCE(sum(kalan) FILTER (WHERE kalan > 0), 0) AS toplam_alacak
       FROM b WHERE ($3::bigint[] IS NULL OR site_id = ANY($3))`, [ctx.firma_id, ay, siteler]);
  const { rows: [t] } = await c.query(
    `SELECT COALESCE(sum(t.tutar), 0) AS tahsilat FROM tahsilatlar t JOIN sozlesmeler s ON s.id = t.sozlesme_id JOIN daireler d ON d.id = s.daire_id
      WHERE t.firma_id = $1 AND NOT t.iptal AND to_char(t.tarih, 'YYYY-MM') = $2 AND ($3::bigint[] IS NULL OR d.site_id = ANY($3))`, [ctx.firma_id, ay, siteler]);
  const { rows: [d] } = await c.query(
    `SELECT count(*) FILTER (WHERE d.aktif)::int AS toplam,
            count(*) FILTER (WHERE d.aktif AND EXISTS (SELECT 1 FROM sozlesmeler s WHERE s.daire_id = d.id AND s.durum = 'Aktif'))::int AS dolu,
            count(*) FILTER (WHERE d.aktif AND d.ev_sahibi_oturuyor AND NOT EXISTS (SELECT 1 FROM sozlesmeler s WHERE s.daire_id = d.id AND s.durum = 'Aktif'))::int AS ev_sahibi
       FROM daireler d WHERE d.firma_id = $1 AND ($2::bigint[] IS NULL OR d.site_id = ANY($2))`, [ctx.firma_id, siteler]);
  const { rows: aylar } = await c.query(
    `SELECT a.ay,
       (SELECT COALESCE(sum(b.tutar), 0) FROM kira_borclari b JOIN sozlesmeler s ON s.id = b.sozlesme_id JOIN daireler d ON d.id = s.daire_id
          WHERE b.firma_id = $1 AND NOT b.iptal AND b.donem = $2 || '-' || lpad(a.ay::text, 2, '0') AND ($4::bigint[] IS NULL OR d.site_id = ANY($4))) AS tahakkuk,
       (SELECT COALESCE(sum(t.tutar), 0) FROM tahsilatlar t JOIN sozlesmeler s ON s.id = t.sozlesme_id JOIN daireler d ON d.id = s.daire_id
          WHERE t.firma_id = $1 AND NOT t.iptal AND extract(year FROM t.tarih) = $3 AND extract(month FROM t.tarih) = a.ay
            AND ($4::bigint[] IS NULL OR d.site_id = ANY($4))) AS tahsilat
     FROM generate_series(1, 12) AS a(ay) ORDER BY a.ay`, [ctx.firma_id, String(y), y, siteler]);
  const tahsilOrani = k.bu_ay_beklenen > 0 ? Math.round((k.bu_ay_odenen / k.bu_ay_beklenen) * 1000) / 10 : 0;
  return {
    yil: y, donem: ay, ...k, bu_ay_tahsilat: t.tahsilat, tahsil_orani: tahsilOrani,
    daire_toplam: d.toplam, daire_dolu: d.dolu, daire_ev_sahibi: d.ev_sahibi, daire_bos: d.toplam - d.dolu - d.ev_sahibi, aylar,
  };
}

// ---------- Rapor ----------

async function rapor(c, ctx, q = {}) {
  const bas = v.donem(q.baslangic, 'Başlangıç dönemi');
  const bit = v.donem(q.bitis, 'Bitiş dönemi');
  if (bit < bas) throw v.hata('Bitiş dönemi başlangıçtan önce olamaz.');
  const durum = q.durum ? v.secim(q.durum, 'Durum', ['Ödendi', 'Gecikti', 'Kısmi Ödendi', 'Bekliyor', 'Açık']) : null;
  const daireId = v.kimlik(q.daire_id, 'Daire', { zorunlu: false });
  const { rows } = await c.query(
    `${borcSorgusu()} WHERE donem BETWEEN $2 AND $3 AND ($4::text IS NULL OR durum = $4 OR ($4 = 'Açık' AND kalan > 0))
        AND ($5::bigint IS NULL OR daire_id = $5) AND ($6::bigint[] IS NULL OR site_id = ANY($6))
      ORDER BY donem, site, blok NULLS FIRST, NULLIF(substring(daire_no from '^[0-9]+'), '')::int NULLS LAST, daire_no`, [ctx.firma_id, bas, bit, durum, daireId, siteFiltresi(ctx, q)]);
  const toplam = rows.reduce((t, r) => ({ tutar: t.tutar + kurus(r.tutar), odenen: t.odenen + kurus(r.odenen), kalan: t.kalan + kurus(r.kalan) }), { tutar: 0, odenen: 0, kalan: 0 });
  return { satirlar: rows, toplam: { tutar: tl(toplam.tutar), odenen: tl(toplam.odenen), kalan: tl(toplam.kalan) } };
}

// Excel'in Türkçe ayarıyla doğrudan açılan CSV (noktalı virgül, virgüllü ondalık, UTF-8 BOM).
function raporCsv(r) {
  const alan = (x) => {
    const s = x === null || x === undefined ? '' : String(x);
    const guvenli = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // formül enjeksiyonuna karşı
    return /[;"\n\r]/.test(guvenli) ? `"${guvenli.replace(/"/g, '""')}"` : guvenli;
  };
  const sayi = (n) => Number(n).toFixed(2).replace('.', ',');
  const satirlar = [['Dönem', 'Site', 'Blok', 'Daire', 'Kiracı', 'Vade', 'Kira', 'Ödenen', 'Kalan', 'Durum', 'Gecikme (gün)']];
  for (const x of r.satirlar) satirlar.push([x.donem, x.site, x.blok || '', x.daire_no, x.ad_soyad, x.vade, sayi(x.tutar), sayi(x.odenen), sayi(x.kalan), x.durum, x.gecikme_gun]);
  satirlar.push(['Toplam', '', '', '', '', '', sayi(r.toplam.tutar), sayi(r.toplam.odenen), sayi(r.toplam.kalan), '', '']);
  return '﻿' + satirlar.map((s) => s.map(alan).join(';')).join('\r\n') + '\r\n';
}

// Sunucu her saat başı çağırır: bütün aktif firmalar için bu ayın borçlarını yazar (çift kayıt oluşmaz).
async function otomatikTahakkuk(pool, islem) {
  const { rows } = await pool.query('SELECT id FROM firmalar WHERE aktif');
  let toplam = 0;
  for (const f of rows) {
    const r = await islem(pool, (c) => tahakkuk(c, { firma_id: f.id, kullanici_id: null }, { donem: buAy() }));
    toplam += r.olusan;
  }
  return toplam;
}

module.exports = {
  bugun, buAy, daireAdi, tamAd, kurus, tl,
  daireler, daireEkle, daireGuncelle,
  sozlesmeler, sozlesme, sozlesmeEkle, sozlesmeGuncelle, sozlesmeAyril,
  tahakkuk, dagit, tahsilatEkle, tahsilatIptal, tahsilatlar,
  borcListesi, borcIptal, gecikenler, ozet, rapor, raporCsv, otomatikTahakkuk,
};
