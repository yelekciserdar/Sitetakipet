'use strict';
// Deneme hesaplarını listeler, süre uzatır ya da kalıcı lisans verir. Sunucuda:
//   node scripts/firma-lisans.js                         deneme kayıtlarını listeler
//   node scripts/firma-lisans.js --eposta x@y.com --gun 7    denemeyi 7 gün uzatır (bugünden ya da bitişten, hangisi ilerideyse)
//   node scripts/firma-lisans.js --eposta x@y.com --kalici   lisans verir (süre sınırı kalkar)
const { havuzOlustur } = require('../lib/db');

function arg(ad) { const i = process.argv.indexOf('--' + ad); return i > 0 ? process.argv[i + 1] : undefined; }

(async () => {
  const pool = havuzOlustur();
  try {
    const eposta = arg('eposta');
    if (!eposta) {
      const { rows } = await pool.query(
        `SELECT f.id, f.ad, f.telefon, f.kayit_kaynagi, f.olusturma::date AS kayit, f.deneme_bitis::date AS bitis,
                (SELECT k.eposta FROM kullanicilar k WHERE k.firma_id = f.id AND k.rol = 'yonetici' ORDER BY k.id LIMIT 1) AS eposta,
                (SELECT count(*) FROM daireler d WHERE d.firma_id = f.id)::int AS daire
           FROM firmalar f ORDER BY f.id DESC LIMIT 200`);
      console.table(rows.map((r) => ({ no: r.id, firma: r.ad, eposta: r.eposta, telefon: r.telefon || '', kaynak: r.kayit_kaynagi, kayit: r.kayit,
        durum: r.bitis ? (r.bitis < new Date().toISOString().slice(0, 10) ? `deneme bitti (${r.bitis})` : `deneme ${r.bitis}'e kadar`) : 'lisanslı', daire: r.daire })));
      return;
    }
    const { rows: [f] } = await pool.query(
      `SELECT f.id, f.ad, f.deneme_bitis FROM firmalar f JOIN kullanicilar k ON k.firma_id = f.id WHERE lower(k.eposta) = lower($1)`, [eposta]);
    if (!f) throw new Error('Bu e-postayla kullanıcı bulunamadı.');
    if (process.argv.includes('--kalici')) {
      await pool.query('UPDATE firmalar SET deneme_bitis = NULL WHERE id = $1', [f.id]);
      console.log(`${f.ad}: lisans verildi, süre sınırı kalktı.`);
    } else {
      const gun = Number(arg('gun'));
      if (!Number.isInteger(gun) || gun < 1 || gun > 365) throw new Error('--gun 1–365 arasında olmalı (ya da --kalici).');
      const { rows: [r] } = await pool.query(
        `UPDATE firmalar SET deneme_bitis = GREATEST(COALESCE(deneme_bitis, now()), now()) + make_interval(days => $2) WHERE id = $1 RETURNING deneme_bitis::date AS bitis`, [f.id, gun]);
      console.log(`${f.ad}: deneme ${r.bitis} tarihine kadar uzatıldı.`);
    }
  } catch (e) {
    console.error('Hata:', e.message); process.exitCode = 1;
  } finally { await pool.end(); }
})();
