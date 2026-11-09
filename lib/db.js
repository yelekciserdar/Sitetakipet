'use strict';
const { Pool, types } = require('pg');
const { HttpHata } = require('./dogrula');

// numeric -> sayı (TL tutarları 14,2 hassasiyetinde, JS sayısına güvenle sığar)
types.setTypeParser(1700, (v) => Number(v));
// bigint (id, count) -> sayı
types.setTypeParser(20, (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error('Veritabanı sayısı güvenli aralığın dışında.');
  return n;
});
// date -> 'YYYY-AA-GG' metni (saat dilimi kayması olmasın)
types.setTypeParser(1082, (v) => v);

function havuzOlustur(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL ayarlanmamış. .env.example dosyasına bakın.');
  return new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10000, options: '-c timezone=Europe/Istanbul' });
}

// PostgreSQL hata kodlarını kullanıcıya anlaşılır uyarıya çevirir.
function pgHatasiniCevir(e) {
  if (e instanceof HttpHata) return e;
  if (e.code === '22003' || e.code === '22P02' || e.code === '22007' || e.code === '22008') {
    return new HttpHata(400, 'Girilen değer geçersiz ya da çok büyük; işlem kaydedilmedi.');
  }
  if (e.code === '23514') return new HttpHata(400, 'Girilen bilgi kurallara uymuyor (ör. tutar, uzunluk ya da saat aralığı).');
  return e;
}

// İşlemi tek bir veritabanı işlemi (transaction) içinde çalıştırır; hata olursa hepsi geri alınır.
async function islem(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sonuc = await fn(client);
    await client.query('COMMIT');
    return sonuc;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw pgHatasiniCevir(e);
  } finally {
    client.release();
  }
}

module.exports = { havuzOlustur, islem, pgHatasiniCevir };
