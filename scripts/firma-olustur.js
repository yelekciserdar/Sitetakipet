'use strict';
// Yeni müşteri firma ve ilk yönetici kullanıcısını açar.
// Kullanım: npm run firma:olustur -- --firma "Deneme Gayrimenkul" --yonetici "Ad Soyad" --eposta deneme@ornek.com
// Parola komut satırına yazılmaz; çalışınca sorulur (komut geçmişinde kalmasın diye).
const readline = require('node:readline');
const { havuzOlustur, islem } = require('../lib/db');
const { gocleriUygula } = require('./migrate');
const { firmaOlustur } = require('../lib/cekirdek');

function arg(ad) {
  const i = process.argv.indexOf('--' + ad);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function parolaSor() {
  return new Promise((coz) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) { if (s.includes('Parola')) rl.output.write(s); };
    rl.question('Parola (en az 10 karakter): ', (p) => { rl.close(); process.stdout.write('\n'); coz(p); });
  });
}

(async () => {
  const pool = havuzOlustur();
  try {
    await gocleriUygula(pool);
    const parola = process.env.YONETICI_PAROLASI || (await parolaSor());
    const s = await islem(pool, (c) => firmaOlustur(c, { firma_ad: arg('firma'), yonetici_ad: arg('yonetici'), eposta: arg('eposta'), parola }));
    console.log(`Firma açıldı (no ${s.firma_id}). Yönetici bu e-postayla giriş yapabilir.`);
  } catch (e) {
    console.error('Firma açılamadı:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
