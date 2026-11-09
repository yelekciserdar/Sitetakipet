'use strict';
const http = require('node:http');
const { havuzOlustur, islem } = require('./lib/db');
const { uygulamaOlustur } = require('./lib/uygulama');
const { gocleriUygula } = require('./scripts/migrate');
const { otomatikTahakkuk } = require('./lib/kira');

async function baslat() {
  if (!process.env.VERI_ANAHTARI) console.warn('Uyarı: VERI_ANAHTARI ayarlı değil; T.C. kimlik no kaydedilemez.');
  const pool = havuzOlustur();
  await gocleriUygula(pool);
  const port = Number(process.env.PORT || 3000);
  const sunucu = http.createServer(uygulamaOlustur(pool));
  sunucu.requestTimeout = 60_000;
  sunucu.listen(port, () => console.log(`KiraTakipEt ${port} numaralı kapıda çalışıyor.`));

  // Her ayın kira borcu kendiliğinden oluşur: açılışta ve saatte bir (aynı ay ikinci kez yazılmaz).
  const tahakkukCalistir = () => otomatikTahakkuk(pool, islem)
    .then((n) => { if (n) console.log(`${n} kira borcu oluşturuldu.`); })
    .catch((e) => console.error('Otomatik tahakkuk hatası:', e.message));
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
