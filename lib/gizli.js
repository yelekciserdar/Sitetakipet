'use strict';
// T.C. kimlik no gibi kişisel verilerin şifreli saklanması (KVKK). AES-256-GCM.
// Anahtar: VERI_ANAHTARI ortam değişkeni, 32 baytın base64 hâli (`openssl rand -base64 32`).
// Anahtar kaybolursa şifreli veriler okunamaz; yedeklerle birlikte güvenli yerde saklanmalı.
const crypto = require('node:crypto');
const { hata } = require('./dogrula');

function anahtar() {
  const b64 = process.env.VERI_ANAHTARI;
  if (!b64) return null;
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('VERI_ANAHTARI 32 baytın base64 hâli olmalı.');
  return k;
}

function sifrele(metin) {
  const k = anahtar();
  if (!k) throw hata('T.C. kimlik no saklamak için sunucuda veri anahtarı ayarlanmamış. Alanı boş bırakın ya da yöneticinize başvurun.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const veri = Buffer.concat([c.update(metin, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${veri.toString('base64')}`;
}

function coz(kayit) {
  if (!kayit) return null;
  const k = anahtar();
  if (!k) throw hata('Sunucuda veri anahtarı ayarlanmamış; şifreli bilgi okunamıyor.', 500);
  const [s, iv, etiket, veri] = kayit.split(':');
  if (s !== 'v1') throw new Error('Bilinmeyen şifre biçimi.');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(etiket, 'base64'));
  return Buffer.concat([d.update(Buffer.from(veri, 'base64')), d.final()]).toString('utf8');
}

// T.C. kimlik no algoritma denetimi (11 hane, ilk hane 0 değil, 10. ve 11. hane kontrol hanesi).
function tcGecerli(tc) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const h = tc.split('').map(Number);
  const tek = h[0] + h[2] + h[4] + h[6] + h[8];
  const cift = h[1] + h[3] + h[5] + h[7];
  if ((((tek * 7 - cift) % 10) + 10) % 10 !== h[9]) return false;
  return h.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === h[10];
}

module.exports = { sifrele, coz, tcGecerli };
