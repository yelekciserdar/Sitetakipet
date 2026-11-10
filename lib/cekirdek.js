'use strict';
// Çekirdek: firma kurulumu, kullanıcılar, ayarlar, kiracı (kişi) kartı, işlem kaydı.
// Her fonksiyon (c, ctx, girdi) alır: c = veritabanı bağlantısı, ctx = { firma_id, kullanici_id, rol }.
const v = require('./dogrula');
const { parolaOzetle, parolaKurali } = require('./oturum');
const { sifrele, coz, tcGecerli } = require('./gizli');
const { ibanNormal } = require('./ekstre');

async function kayitYaz(c, ctx, tur, aciklama) {
  await c.query('INSERT INTO islem_kaydi (firma_id, kullanici_id, tur, aciklama) VALUES ($1, $2, $3, $4)', [
    ctx.firma_id, ctx.kullanici_id || null, tur, String(aciklama).slice(0, 1000),
  ]);
}

const paraMetni = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';

function epostaDogrula(e) {
  const s = v.metin(e, 'E-posta', { zorunlu: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw v.hata('E-posta adresi geçersiz.');
  return s.toLowerCase();
}
function epostaCakismasi(e) {
  if (e.code === '23505') throw v.hata('Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.', 409);
  throw e;
}

// ---- Firma ve kullanıcılar ----

async function firmaOlustur(c, g) {
  const ad = v.metin(g.firma_ad, 'Firma adı', { zorunlu: true });
  const yoneticiAd = v.metin(g.yonetici_ad, 'Yönetici adı', { zorunlu: true, max: 120 });
  const eposta = epostaDogrula(g.eposta);
  const parola = parolaKurali(g.parola);
  const { rows: [firma] } = await c.query('INSERT INTO firmalar (ad) VALUES ($1) RETURNING id', [ad]);
  const { rows: [kul] } = await c.query(
    `INSERT INTO kullanicilar (firma_id, ad_soyad, eposta, parola_ozet, rol) VALUES ($1, $2, $3, $4, 'yonetici') RETURNING id`,
    [firma.id, yoneticiAd, eposta, parolaOzetle(parola)]).catch(epostaCakismasi);
  const { rows: [site] } = await c.query('INSERT INTO siteler (firma_id, ad) VALUES ($1, $2) RETURNING id',
    [firma.id, v.metin(g.site_ad, 'Site adı', { max: 120 }) || 'Ana Site']);
  await kayitYaz(c, { firma_id: firma.id, kullanici_id: kul.id }, 'Firma oluşturuldu', ad);
  return { firma_id: firma.id, kullanici_id: kul.id, site_id: site.id };
}

async function kullanicilar(c, ctx) {
  const { rows } = await c.query(
    `SELECT k.id, k.ad_soyad, k.eposta, k.rol, k.aktif, k.olusturma,
            COALESCE((SELECT array_agg(ks.site_id ORDER BY ks.site_id) FROM kullanici_siteleri ks WHERE ks.kullanici_id = k.id), '{}') AS site_idler
       FROM kullanicilar k WHERE k.firma_id = $1 ORDER BY k.ad_soyad`, [ctx.firma_id]);
  return rows;
}

async function kullaniciEkle(c, ctx, g) {
  const ad = v.metin(g.ad_soyad, 'Ad soyad', { zorunlu: true, max: 120 });
  const eposta = epostaDogrula(g.eposta);
  const rol = v.secim(g.rol, 'Rol', ['yonetici', 'personel'], { varsayilan: 'personel' });
  const parola = parolaKurali(g.parola);
  const { rows: [k] } = await c.query(
    'INSERT INTO kullanicilar (firma_id, ad_soyad, eposta, parola_ozet, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [ctx.firma_id, ad, eposta, parolaOzetle(parola), rol]).catch(epostaCakismasi);
  // Yönetici bütün siteleri görür; site ataması yalnız personelde anlamlıdır.
  await require('./site').kullaniciSiteleriYaz(c, ctx, k.id, rol === 'yonetici' ? [] : g.site_idler);
  await kayitYaz(c, ctx, 'Kullanıcı eklendi', `${ad} (${rol})`);
  return { id: k.id };
}

async function kullaniciGuncelle(c, ctx, id, g) {
  id = v.kimlik(id, 'Kullanıcı');
  const { rows: [k] } = await c.query('SELECT * FROM kullanicilar WHERE id = $1 AND firma_id = $2 FOR UPDATE', [id, ctx.firma_id]);
  if (!k) throw v.hata('Kullanıcı bulunamadı.', 404);
  const rol = g.rol === undefined ? k.rol : v.secim(g.rol, 'Rol', ['yonetici', 'personel']);
  const aktif = v.mantiksal(g.aktif, { varsayilan: k.aktif });
  if (id === ctx.kullanici_id && (rol !== 'yonetici' || !aktif)) throw v.hata('Kendi yöneticiliğinizi kaldıramaz ya da kendinizi pasif yapamazsınız.');
  const parolaOzet = g.parola ? parolaOzetle(parolaKurali(g.parola)) : k.parola_ozet;
  await c.query('UPDATE kullanicilar SET rol = $1, aktif = $2, parola_ozet = $3 WHERE id = $4', [rol, aktif, parolaOzet, id]);
  await require('./site').kullaniciSiteleriYaz(c, ctx, id, rol === 'yonetici' ? [] : g.site_idler);
  if (!aktif || g.parola) await c.query('DELETE FROM oturumlar WHERE kullanici_id = $1', [id]);
  await kayitYaz(c, ctx, 'Kullanıcı güncellendi', `${k.ad_soyad}: ${rol}${aktif ? '' : ', pasif'}${g.parola ? ', parola değişti' : ''}`);
  return { id };
}

async function ayarlar(c, ctx) {
  const { rows: [f] } = await c.query(
    'SELECT id, ad, gecikme_gun, yaklasan_gun, varsayilan_odeme_gunu, kira_modulu FROM firmalar WHERE id = $1', [ctx.firma_id]);
  return f;
}

function gunSayisi(x, ad, min, max) {
  const n = typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x;
  if (!Number.isInteger(n) || n < min || n > max) throw v.hata(`${ad} ${min}–${max} arasında bir tam sayı olmalı.`);
  return n;
}

async function ayarlariKaydet(c, ctx, g) {
  const ad = v.metin(g.ad, 'Firma adı', { zorunlu: true });
  const gecikme = gunSayisi(g.gecikme_gun, 'Gecikme günü', 0, 60);
  const yaklasan = gunSayisi(g.yaklasan_gun, 'Yaklaşan ödeme uyarısı', 0, 60);
  const odemeGunu = gunSayisi(g.varsayilan_odeme_gunu, 'Varsayılan ödeme günü', 1, 31);
  const { rows: [eski] } = await c.query('SELECT kira_modulu FROM firmalar WHERE id = $1', [ctx.firma_id]);
  const kira = v.mantiksal(g.kira_modulu, { varsayilan: eski.kira_modulu });
  await c.query('UPDATE firmalar SET ad = $1, gecikme_gun = $2, yaklasan_gun = $3, varsayilan_odeme_gunu = $4, kira_modulu = $5 WHERE id = $6',
    [ad, gecikme, yaklasan, odemeGunu, kira, ctx.firma_id]);
  await kayitYaz(c, ctx, 'Ayarlar kaydedildi', `Gecikme ${gecikme} gün, yaklaşan uyarı ${yaklasan} gün, ödeme günü ${odemeGunu}, kira bölümü ${kira ? 'açık' : 'kapalı'}`);
  return ayarlar(c, ctx);
}

// ---- Kiracı kartı ----

const KISI_SECIM = `SELECT k.id, k.ad_soyad, k.telefon, k.eposta, k.tc_son4, k.iban, k.odeme_kodu, k.notlar,
  (SELECT s.id FROM sozlesmeler s WHERE s.kisi_id = k.id AND s.durum = 'Aktif' ORDER BY s.id DESC LIMIT 1) AS aktif_sozlesme_id
  FROM kisiler k`;

// Site yetkisi sınırlı kullanıcı yalnız kendi sitelerinde sözleşmesi olan (ya da hiç sözleşmesi olmayan) kiracıları görür.
const KISI_SITE_KOSULU = (p) => `(${p}::bigint[] IS NULL
  OR NOT EXISTS (SELECT 1 FROM sozlesmeler s0 WHERE s0.kisi_id = k.id)
  OR EXISTS (SELECT 1 FROM sozlesmeler s1 JOIN daireler d1 ON d1.id = s1.daire_id WHERE s1.kisi_id = k.id AND d1.site_id = ANY(${p}::bigint[])))`;

async function kisiler(c, ctx, q = {}) {
  const ara = v.metin(q.ara, 'Arama', { max: 100 });
  const { rows } = await c.query(
    `${KISI_SECIM} WHERE k.firma_id = $1 AND ($2::text IS NULL OR k.ad_soyad ILIKE '%' || $2 || '%' OR k.telefon ILIKE '%' || $2 || '%')
        AND ${KISI_SITE_KOSULU('$3')}
      ORDER BY k.ad_soyad LIMIT 500`, [ctx.firma_id, ara, ctx.siteler || null]);
  return rows;
}

async function kisi(c, ctx, id) {
  id = v.kimlik(id, 'Kiracı');
  const { rows: [k] } = await c.query(`${KISI_SECIM} WHERE k.id = $1 AND k.firma_id = $2 AND ${KISI_SITE_KOSULU('$3')}`, [id, ctx.firma_id, ctx.siteler || null]);
  if (!k) throw v.hata('Kiracı bulunamadı.', 404);
  return k;
}

function kisiAlanlari(g) {
  const tcHam = v.metin(g.tc, 'T.C. kimlik no', { max: 20 });
  const tc = tcHam ? tcHam.replace(/\s/g, '') : null;
  if (tc && !tcGecerli(tc)) throw v.hata('T.C. kimlik no geçersiz.');
  const ibanHam = v.metin(g.iban, 'IBAN', { max: 50 });
  const iban = ibanHam ? ibanNormal(ibanHam) : null;
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) throw v.hata('IBAN geçersiz (ör. TR00 0000 0000 0000 0000 0000 00).');
  if (iban && iban.startsWith('TR') && iban.length !== 26) throw v.hata('Türkiye IBAN\'ı 26 karakter olmalı.');
  const kod = v.metin(g.odeme_kodu, 'Ödeme açıklama kodu', { max: 30 });
  if (kod && kod.length < 3) throw v.hata('Ödeme açıklama kodu en az 3 karakter olmalı.');
  return {
    ad_soyad: v.metin(g.ad_soyad, 'Ad soyad', { zorunlu: true, max: 120 }),
    telefon: v.metin(g.telefon, 'Telefon', { max: 30 }),
    eposta: v.metin(g.eposta, 'E-posta', { max: 200 }),
    notlar: v.metin(g.notlar, 'Not', { max: 2000 }),
    tc, iban, odeme_kodu: kod ? kod.toUpperCase() : null,
  };
}

function kodCakismasi(e) {
  if (e.code === '23505' && /kisiler_odeme_kodu/.test(e.constraint || e.message)) throw v.hata('Bu ödeme açıklama kodu başka bir kiracıda kullanılıyor.', 409);
  throw e;
}

async function kisiEkle(c, ctx, g) {
  const k = kisiAlanlari(g);
  const { rows: [r] } = await c.query(
    `INSERT INTO kisiler (firma_id, ad_soyad, telefon, eposta, tc_sifreli, tc_son4, iban, odeme_kodu, notlar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ctx.firma_id, k.ad_soyad, k.telefon, k.eposta, k.tc ? sifrele(k.tc) : null, k.tc ? k.tc.slice(-4) : null, k.iban, k.odeme_kodu, k.notlar])
    .catch(kodCakismasi);
  await kayitYaz(c, ctx, 'Kiracı eklendi', k.ad_soyad);
  return { id: r.id };
}

// T.C. alanı boş gelirse mevcut değer korunur; silmek için tc_sil=true gönderilir.
async function kisiGuncelle(c, ctx, id, g) {
  id = v.kimlik(id, 'Kiracı');
  const k = kisiAlanlari(g);
  const { rows: [eski] } = await c.query('SELECT tc_sifreli, tc_son4 FROM kisiler WHERE id = $1 AND firma_id = $2 FOR UPDATE', [id, ctx.firma_id]);
  if (!eski) throw v.hata('Kiracı bulunamadı.', 404);
  let tcSifreli = eski.tc_sifreli; let tcSon4 = eski.tc_son4;
  if (k.tc) { tcSifreli = sifrele(k.tc); tcSon4 = k.tc.slice(-4); }
  if (v.mantiksal(g.tc_sil)) { tcSifreli = null; tcSon4 = null; }
  await c.query(
    `UPDATE kisiler SET ad_soyad = $1, telefon = $2, eposta = $3, tc_sifreli = $4, tc_son4 = $5, iban = $6, odeme_kodu = $7, notlar = $8
      WHERE id = $9`, [k.ad_soyad, k.telefon, k.eposta, tcSifreli, tcSon4, k.iban, k.odeme_kodu, k.notlar, id]).catch(kodCakismasi);
  await kayitYaz(c, ctx, 'Kiracı güncellendi', k.ad_soyad);
  return { id };
}

// T.C. kimlik nosunu açık hâliyle gösterir (yalnız yönetici); her görüntüleme işlem kaydına yazılır (KVKK erişim izi).
async function kisiTc(c, ctx, id) {
  id = v.kimlik(id, 'Kiracı');
  const { rows: [k] } = await c.query('SELECT ad_soyad, tc_sifreli FROM kisiler WHERE id = $1 AND firma_id = $2', [id, ctx.firma_id]);
  if (!k) throw v.hata('Kiracı bulunamadı.', 404);
  if (!k.tc_sifreli) return { tc: null };
  await kayitYaz(c, ctx, 'T.C. kimlik no görüntülendi', k.ad_soyad);
  return { tc: coz(k.tc_sifreli) };
}

async function islemKaydi(c, ctx) {
  const { rows } = await c.query(
    `SELECT i.zaman, i.tur, i.aciklama, k.ad_soyad AS kullanici
       FROM islem_kaydi i LEFT JOIN kullanicilar k ON k.id = i.kullanici_id
      WHERE i.firma_id = $1 ORDER BY i.zaman DESC, i.id DESC LIMIT 500`, [ctx.firma_id]);
  return rows;
}

module.exports = {
  kayitYaz, paraMetni,
  firmaOlustur, kullanicilar, kullaniciEkle, kullaniciGuncelle, ayarlar, ayarlariKaydet,
  kisiler, kisi, kisiEkle, kisiGuncelle, kisiTc, islemKaydi,
};
