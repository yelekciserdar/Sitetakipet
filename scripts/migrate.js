'use strict';
// migrations/ klasöründeki SQL dosyalarını sırayla, her biri bir kez olmak üzere uygular.
const fs = require('node:fs');
const path = require('node:path');

const KLASOR = path.join(__dirname, '..', 'migrations');

async function gocleriUygula(pool) {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(84120932)'); // aynı anda iki sunucu göç uygulamasın
    await c.query('CREATE TABLE IF NOT EXISTS goc_kaydi (ad text PRIMARY KEY, uygulama timestamptz NOT NULL DEFAULT now())');
    const { rows } = await c.query('SELECT ad FROM goc_kaydi');
    const yapilan = new Set(rows.map((r) => r.ad));
    const dosyalar = fs.readdirSync(KLASOR).filter((f) => /^\d{3}-.+\.sql$/.test(f)).sort();
    const uygulanan = [];
    for (const f of dosyalar) {
      if (yapilan.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(KLASOR, f), 'utf8'));
        await c.query('INSERT INTO goc_kaydi (ad) VALUES ($1)', [f]);
        await c.query('COMMIT');
        uygulanan.push(f);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`${f} uygulanamadı: ${e.message}`);
      }
    }
    return uygulanan;
  } finally {
    await c.query('SELECT pg_advisory_unlock(84120932)').catch(() => {});
    c.release();
  }
}

if (require.main === module) {
  const { havuzOlustur } = require('../lib/db');
  const pool = havuzOlustur();
  gocleriUygula(pool)
    .then((u) => console.log(u.length ? `Uygulandı: ${u.join(', ')}` : 'Veritabanı güncel.'))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { gocleriUygula };
