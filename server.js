'use strict';
const http = require('node:http');
const { havuzOlustur, islem } = require('./lib/db');
const { uygulamaOlustur } = require('./lib/uygulama');
const { gocleriUygula } = require('./scripts/migrate');
const { otomatikTahakkuk } = require('./lib/kira');
const aidat = require('./lib/aidat');

async function baslat() {
  if (!process.env.VERI_ANAHTARI) console.warn('Uyarı: VERI_ANAHTARI ayarlı değil; T.C. kimlik no kaydedilemez.');
  const pool = havuzOlustur();
  await gocleriUygula(pool);
  const port = Number(process.env.PORT || 3000);
  const sunucu = http.createServer(uygulamaOlustur(pool));
  sunucu.requestTimeout = 60_000;
  // HOST=127.0.0.1 canlıda yalnız nginx'in erişmesi için; boşsa bütün arayüzler (Docker).
  sunucu.listen(port, process.env.HOST || undefined, () => console.log(`SiteTakipEt ${port} numaralı kapıda çalışıyor.`));

  // Her ayın aidat ve kira borcu kendiliğinden oluşur: açılışta ve saatte bir (aynı ay ikinci kez yazılmaz).
  const tahakkukCalistir = () => Promise.all([
    otomatikTahakkuk(pool, islem).then((n) => { if (n) console.log(`${n} kira borcu oluşturuldu.`); }),
    aidat.otomatikTahakkuk(pool, islem).then((n) => { if (n) console.log(`${n} aidat borcu oluşturuldu.`); }),
  ]).catch((e) => console.error('Otomatik tahakkuk hatası:', e.message));
  tahakkukCalistir();
  const zamanlayici = setInterval(tahakkukCalistir, 60 * 60 * 1000);

  const kapat = () => { clearInterval(zamanlayici); sunucu.close(() => pool.end().then(() => process.exit(0))); };
  process.on('SIGTERM', kapat);
  process.on('SIGINT', kapat);
}

baslat().catch((e) => {
  console.error('Başlatılamadı:', e.message);
  process.exit(1);
});
