'use strict';
// Siteler ve site yetkisi.
// ctx.siteler: null → bütün siteler (yönetici ya da ataması olmayan personel); dizi → yalnız bu siteler.
const v = require('./dogrula');
const { kayitYaz } = require('./cekirdek');

// Liste sorgularında kullanılacak site süzgeci: null (süzgeç yok) ya da izinli site no dizisi.
// İstenen site kullanıcının yetkisinde değilse 403.
function siteFiltresi(ctx, q = {}) {
  const istenen = v.kimlik(q.site_id, 'Site', { zorunlu: false });
  if (ctx.siteler) {
    if (istenen && !ctx.siteler.includes(istenen)) throw v.hata('Bu siteye yetkiniz yok.', 403);
    return istenen ? [istenen] : ctx.siteler;
  }
  return istenen ? [istenen] : null;
}

const izinliMi = (ctx, siteId) => !ctx.siteler || ctx.siteler.includes(Number(siteId));

// Tek kayıt işlemlerinde: kayıt başka siteye aitse "bulunamadı" (varlığını sızdırmamak için 404).
function siteDenetle(ctx, siteId, ne = 'Kayıt') {
  if (!izinliMi(ctx, siteId)) throw v.hata(`${ne} bulunamadı.`, 404);
}

async function siteBul(c, ctx, siteId) {
  const id = v.kimlik(siteId, 'Site');
  const { rows: [s] } = await c.query('SELECT id, ad, aktif FROM siteler WHERE id = $1 AND firma_id = $2', [id, ctx.firma_id]);
  if (!s) throw v.hata('Site bulunamadı.', 404);
  siteDenetle(ctx, s.id, 'Site');
  return s;
}

async function siteler(c, ctx) {
  const { rows } = await c.query(
    `SELECT s.id, s.ad, s.adres, s.aktif,
            (SELECT count(*)::int FROM daireler d WHERE d.site_id = s.id AND d.aktif) AS daire_sayisi,
            (SELECT count(*)::int FROM daireler d JOIN sozlesmeler so ON so.daire_id = d.id AND so.durum = 'Aktif' WHERE d.site_id = s.id) AS dolu,
            (SELECT count(*)::int FROM daireler d WHERE d.site_id = s.id AND d.aktif AND d.ev_sahibi_oturuyor
                AND NOT EXISTS (SELECT 1 FROM sozlesmeler so WHERE so.daire_id = d.id AND so.durum = 'Aktif')) AS ev_sahibi
       FROM siteler s WHERE s.firma_id = $1 AND ($2::bigint[] IS NULL OR s.id = ANY($2))
      ORDER BY s.aktif DESC, s.ad`, [ctx.firma_id, ctx.siteler]);
  return rows;
}

function siteAlanlari(g) {
  return { ad: v.metin(g.ad, 'Site adı', { zorunlu: true, max: 120 }), adres: v.metin(g.adres, 'Adres', { max: 500 }) };
}
const adCakismasi = (e) => { if (e.code === '23505') throw v.hata('Bu adla bir site zaten var.', 409); throw e; };

async function siteEkle(c, ctx, g) {
  const s = siteAlanlari(g);
  const { rows: [r] } = await c.query('INSERT INTO siteler (firma_id, ad, adres) VALUES ($1, $2, $3) RETURNING id', [ctx.firma_id, s.ad, s.adres]).catch(adCakismasi);
  await kayitYaz(c, ctx, 'Site eklendi', s.ad);
  return { id: r.id };
}

async function siteGuncelle(c, ctx, id, g) {
  const eski = await siteBul(c, ctx, id);
  const s = siteAlanlari(g);
  const aktif = v.mantiksal(g.aktif, { varsayilan: eski.aktif });
  if (!aktif && eski.aktif) {
    const { rows: [x] } = await c.query(
      `SELECT count(*)::int AS n FROM sozlesmeler so JOIN daireler d ON d.id = so.daire_id WHERE d.site_id = $1 AND so.durum = 'Aktif'`, [eski.id]);
    if (x.n) throw v.hata(`Sitede ${x.n} aktif kiracı var; önce onları "Ayrıldı" yapın.`, 409);
  }
  await c.query('UPDATE siteler SET ad = $1, adres = $2, aktif = $3 WHERE id = $4', [s.ad, s.adres, aktif, eski.id]).catch(adCakismasi);
  await kayitYaz(c, ctx, 'Site güncellendi', `${s.ad}${aktif ? '' : ' (pasif)'}`);
  return { id: eski.id };
}

// Kullanıcının site atamaları (boş dizi = bütün siteler).
async function kullaniciSiteleriYaz(c, ctx, kullaniciId, siteIdler) {
  if (siteIdler === undefined) return;
  if (!Array.isArray(siteIdler) || siteIdler.length > 500) throw v.hata('Site listesi geçersiz.');
  const idler = [...new Set(siteIdler.map((x) => v.kimlik(x, 'Site')))];
  if (idler.length) {
    const { rows } = await c.query('SELECT id FROM siteler WHERE firma_id = $1 AND id = ANY($2)', [ctx.firma_id, idler]);
    if (rows.length !== idler.length) throw v.hata('Site bulunamadı.', 404);
  }
  await c.query('DELETE FROM kullanici_siteleri WHERE kullanici_id = $1', [kullaniciId]);
  for (const s of idler) await c.query('INSERT INTO kullanici_siteleri (kullanici_id, site_id) VALUES ($1, $2)', [kullaniciId, s]);
}

async function kullaniciSiteleri(c, kullaniciId) {
  const { rows } = await c.query('SELECT site_id FROM kullanici_siteleri WHERE kullanici_id = $1 ORDER BY site_id', [kullaniciId]);
  return rows.map((r) => r.site_id);
}

module.exports = { siteFiltresi, izinliMi, siteDenetle, siteBul, siteler, siteEkle, siteGuncelle, kullaniciSiteleriYaz, kullaniciSiteleri };
