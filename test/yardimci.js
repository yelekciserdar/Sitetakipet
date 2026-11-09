'use strict';
// Testler gerçek bir PostgreSQL'e karşı çalışır: TEST_DATABASE_URL'deki veritabanı her dosyada sıfırlanır.
const http = require('node:http');
const { havuzOlustur, islem } = require('../lib/db');
const { gocleriUygula } = require('../scripts/migrate');
const { uygulamaOlustur } = require('../lib/uygulama');
const { firmaOlustur } = require('../lib/cekirdek');

const URL_ = process.env.TEST_DATABASE_URL;

async function ortamKur() {
  if (!URL_) throw new Error('TEST_DATABASE_URL ayarlanmamış (ör. postgres://postgres@127.0.0.1:5432/salon_test). Bu veritabanı silinir!');
  const pool = havuzOlustur(URL_);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await gocleriUygula(pool);
  const sunucu = http.createServer(uygulamaOlustur(pool));
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  const taban = `http://127.0.0.1:${sunucu.address().port}`;
  return {
    pool,
    taban,
    async kapat() {
      await new Promise((r) => sunucu.close(r));
      await pool.end();
    },
    firma: (g) => islem(pool, (c) => firmaOlustur(c, g)),
    istemci: () => istemci(taban),
  };
}

// Çerez tutan küçük HTTP istemcisi.
function istemci(taban) {
  let cerez = '';
  async function istek(yontem, yol, govde) {
    const r = await fetch(taban + yol, {
      method: yontem,
      headers: { ...(govde !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cerez ? { Cookie: cerez } : {}) },
      body: govde !== undefined ? JSON.stringify(govde) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cerez = sc.split(';')[0];
    const veri = await r.json().catch(() => null);
    return { status: r.status, veri };
  }
  return {
    get: (y) => istek('GET', y),
    post: (y, g = {}) => istek('POST', y, g),
    put: (y, g = {}) => istek('PUT', y, g),
    giris: (eposta, parola) => istek('POST', '/api/giris', { eposta, parola }),
    cerez: () => cerez,
  };
}

module.exports = { ortamKur };
