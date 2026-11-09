'use strict';
const crypto = require('node:crypto');
const { hata } = require('./dogrula');

const CEREZ = 'kt_oturum';
const OTURUM_SURESI_MS = 12 * 60 * 60 * 1000; // 12 saat

// Parola: scrypt (tuzlu). Biçim: scrypt$<tuz hex>$<özet hex>
function parolaOzetle(parola) {
  const tuz = crypto.randomBytes(16);
  const ozet = crypto.scryptSync(parola, tuz, 64);
  return `scrypt$${tuz.toString('hex')}$${ozet.toString('hex')}`;
}

function parolaDogrula(parola, kayit) {
  const [tur, tuzHex, ozetHex] = String(kayit).split('$');
  if (tur !== 'scrypt' || !tuzHex || !ozetHex) return false;
  const beklenen = Buffer.from(ozetHex, 'hex');
  const gelen = crypto.scryptSync(parola, Buffer.from(tuzHex, 'hex'), beklenen.length);
  return crypto.timingSafeEqual(beklenen, gelen);
}

function parolaKurali(parola) {
  if (typeof parola !== 'string' || parola.length < 10) throw hata('Parola en az 10 karakter olmalı.');
  if (parola.length > 200) throw hata('Parola çok uzun.');
  return parola;
}

const ozet = (anahtar) => crypto.createHash('sha256').update(anahtar).digest('hex');

// Kaba kuvvet denemesine karşı: aynı e-posta + adres için 15 dakikada en fazla 10 hatalı giriş.
const hataliGirisler = new Map();
const KILIT_PENCERE_MS = 15 * 60 * 1000;
function girisKilidi(anahtar) {
  const simdi = Date.now();
  const kayit = hataliGirisler.get(anahtar);
  if (kayit && simdi - kayit.ilk > KILIT_PENCERE_MS) hataliGirisler.delete(anahtar);
  const g = hataliGirisler.get(anahtar);
  if (g && g.sayi >= 10) throw hata('Çok sayıda hatalı giriş. 15 dakika sonra yeniden deneyin.', 429);
}
function hataliGirisYaz(anahtar) {
  const g = hataliGirisler.get(anahtar) || { sayi: 0, ilk: Date.now() };
  g.sayi += 1;
  hataliGirisler.set(anahtar, g);
}
const hataliGirisSifirla = (anahtar) => hataliGirisler.delete(anahtar);

async function oturumAc(pool, kullaniciId) {
  const anahtar = crypto.randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM oturumlar WHERE son_kullanma < now()');
  await pool.query('INSERT INTO oturumlar (anahtar_ozet, kullanici_id, son_kullanma) VALUES ($1, $2, $3)', [
    ozet(anahtar),
    kullaniciId,
    new Date(Date.now() + OTURUM_SURESI_MS),
  ]);
  return anahtar;
}

function cerezOku(req) {
  const satir = req.headers.cookie || '';
  for (const parca of satir.split(';')) {
    const [ad, ...deger] = parca.trim().split('=');
    if (ad === CEREZ) return deger.join('=');
  }
  return null;
}

function cerezYaz(anahtar, { sil = false } = {}) {
  const guvenli = process.env.GUVENLI_CEREZ === '1' ? '; Secure' : '';
  if (sil) return `${CEREZ}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${guvenli}`;
  return `${CEREZ}=${anahtar}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OTURUM_SURESI_MS / 1000}${guvenli}`;
}

async function oturumuBul(pool, req) {
  const anahtar = cerezOku(req);
  if (!anahtar || anahtar.length > 100) return null;
  const { rows } = await pool.query(
    `SELECT k.id, k.firma_id, k.ad_soyad, k.eposta, k.rol,
            f.ad AS firma_ad
       FROM oturumlar o
       JOIN kullanicilar k ON k.id = o.kullanici_id AND k.aktif
       JOIN firmalar f ON f.id = k.firma_id AND f.aktif
      WHERE o.anahtar_ozet = $1 AND o.son_kullanma > now()`,
    [ozet(anahtar)],
  );
  return rows[0] || null;
}

async function oturumKapat(pool, req) {
  const anahtar = cerezOku(req);
  if (anahtar) await pool.query('DELETE FROM oturumlar WHERE anahtar_ozet = $1', [ozet(anahtar)]);
}

module.exports = {
  parolaOzetle, parolaDogrula, parolaKurali, oturumAc, oturumuBul, oturumKapat, cerezYaz,
  girisKilidi, hataliGirisYaz, hataliGirisSifirla,
};
