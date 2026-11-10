'use strict';
// HTTP katmanı: yönlendirme, oturum, yetki, JSON gövde, CSV indirme, statik dosyalar.
const fs = require('node:fs');
const path = require('node:path');
const { islem, pgHatasiniCevir } = require('./db');
const { HttpHata, hata, metin } = require('./dogrula');
const otr = require('./oturum');
const ck = require('./cekirdek');
const kr = require('./kira');
const bk = require('./banka');
const st = require('./site');
const ai = require('./aidat');

const Y = 'yonetici';
const P = 'personel';
const HERKES = [Y, P];

// [yöntem, yol, roller, işleyici(c, ctx, girdi, param, sorgu), seçenekler]
const YOLLAR = [
  ['GET', '/api/ozet', HERKES, (c, x, g, p, q) => kr.ozet(c, x, q)],

  ['GET', '/api/siteler', HERKES, (c, x) => st.siteler(c, x)],
  ['POST', '/api/siteler', [Y], (c, x, g) => st.siteEkle(c, x, g), { yazma: true }],
  ['PUT', '/api/siteler/:id', [Y], (c, x, g, p) => st.siteGuncelle(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/daireler', HERKES, (c, x, g, p, q) => kr.daireler(c, x, q)],
  ['POST', '/api/daireler', [Y], (c, x, g) => kr.daireEkle(c, x, g), { yazma: true }],
  ['PUT', '/api/daireler/:id', [Y], (c, x, g, p) => kr.daireGuncelle(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/kisiler', HERKES, (c, x, g, p, q) => ck.kisiler(c, x, q)],
  ['GET', '/api/kisiler/:id', HERKES, (c, x, g, p) => ck.kisi(c, x, p.id)],
  ['GET', '/api/kisiler/:id/tc', [Y], (c, x, g, p) => ck.kisiTc(c, x, p.id), { yazma: true, govdesiz: true }],
  ['POST', '/api/kisiler', [Y], (c, x, g) => ck.kisiEkle(c, x, g), { yazma: true }],
  ['PUT', '/api/kisiler/:id', [Y], (c, x, g, p) => ck.kisiGuncelle(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/sozlesmeler', HERKES, (c, x, g, p, q) => kr.sozlesmeler(c, x, q)],
  ['GET', '/api/sozlesmeler/:id', HERKES, (c, x, g, p) => kr.sozlesme(c, x, p.id)],
  ['POST', '/api/sozlesmeler', [Y], (c, x, g) => kr.sozlesmeEkle(c, x, g), { yazma: true }],
  ['PUT', '/api/sozlesmeler/:id', [Y], (c, x, g, p) => kr.sozlesmeGuncelle(c, x, p.id, g), { yazma: true }],
  ['POST', '/api/sozlesmeler/:id/ayril', [Y], (c, x, g, p) => kr.sozlesmeAyril(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/borclar', HERKES, (c, x, g, p, q) => kr.borcListesi(c, x, q)],
  ['POST', '/api/borclar/olustur', [Y], (c, x, g) => kr.tahakkuk(c, x, g), { yazma: true }],
  ['POST', '/api/borclar/:id/iptal', [Y], (c, x, g, p) => kr.borcIptal(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/tahsilatlar', [Y], (c, x, g, p, q) => kr.tahsilatlar(c, x, q)],
  ['POST', '/api/tahsilatlar', HERKES, (c, x, g) => kr.tahsilatEkle(c, x, g), { yazma: true }],
  ['POST', '/api/tahsilatlar/:id/iptal', [Y], (c, x, g, p) => kr.tahsilatIptal(c, x, p.id, g), { yazma: true }],

  ['GET', '/api/gecikenler', HERKES, (c, x, g, p, q) => kr.gecikenler(c, x, q)],

  ['GET', '/api/banka', [Y], (c, x, g, p, q) => bk.hareketler(c, x, q)],
  ['POST', '/api/banka/yukle', [Y], (c, x, g) => bk.ekstreYukle(c, x, g), { yazma: true, sinir: 8 * 1024 * 1024 }],
  ['POST', '/api/banka/yeniden-esle', [Y], (c, x) => bk.yenidenEsle(c, x), { yazma: true }],
  ['POST', '/api/banka/:id/eslestir', [Y], (c, x, g, p) => bk.elleEslestir(c, x, p.id, g), { yazma: true }],
  ['POST', '/api/banka/:id/yok-say', [Y], (c, x, g, p) => bk.yokSay(c, x, p.id), { yazma: true }],

  ['GET', '/api/rapor', [Y], (c, x, g, p, q) => kr.rapor(c, x, q)],
  ['GET', '/api/rapor.csv', [Y], async (c, x, g, p, q) => ({ __csv: kr.raporCsv(await kr.rapor(c, x, q)), dosya: `kira-raporu-${q.baslangic}-${q.bitis}.csv` })],

  // ---- Aidat (site yönetimi) ----
  ['GET', '/api/aidat/ozet', HERKES, (c, x, g, p, q) => ai.ozet(c, x, q)],
  ['GET', '/api/aidat/plan/:site', HERKES, (c, x, g, p) => ai.aidatPlani(c, x, p.site)],
  ['PUT', '/api/aidat/plan/:site', [Y], (c, x, g, p) => ai.aidatPlaniKaydet(c, x, p.site, g), { yazma: true }],
  ['PUT', '/api/aidat/daire/:id', [Y], (c, x, g, p) => ai.daireAidatKaydet(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/aidat/daire/:id', HERKES, (c, x, g, p) => ai.daireHesabi(c, x, p.id)],
  ['POST', '/api/aidat/tahakkuk', [Y], (c, x, g) => ai.tahakkuk(c, x, g), { yazma: true }],
  ['GET', '/api/aidat/borclar', HERKES, (c, x, g, p, q) => ai.borclar(c, x, q)],
  ['POST', '/api/aidat/borclar/:id/iptal', [Y], (c, x, g, p) => ai.borcIptal(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/aidat/borclular', HERKES, (c, x, g, p, q) => ai.borclular(c, x, q)],
  ['GET', '/api/aidat/tahsilatlar', HERKES, (c, x, g, p, q) => ai.tahsilatlar(c, x, q)],
  ['POST', '/api/aidat/tahsilatlar', HERKES, (c, x, g) => ai.tahsilatEkle(c, x, g), { yazma: true }],
  ['POST', '/api/aidat/tahsilatlar/:id/iptal', [Y], (c, x, g, p) => ai.tahsilatIptal(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/aidat/makbuz/:id', HERKES, (c, x, g, p) => ai.makbuz(c, x, p.id)],
  ['GET', '/api/aidat/ek-toplamalar', HERKES, (c, x, g, p, q) => ai.ekToplamalar(c, x, q)],
  ['POST', '/api/aidat/ek-toplamalar', [Y], (c, x, g) => ai.ekToplamaEkle(c, x, g), { yazma: true }],
  ['POST', '/api/aidat/ek-toplamalar/:id/iptal', [Y], (c, x, g, p) => ai.ekToplamaIptal(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/giderler', HERKES, (c, x, g, p, q) => ai.giderler(c, x, q)],
  ['POST', '/api/giderler', HERKES, (c, x, g) => ai.giderEkle(c, x, g), { yazma: true }],
  ['POST', '/api/giderler/:id/iptal', [Y], (c, x, g, p) => ai.giderIptal(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/gelir-gider', [Y], (c, x, g, p, q) => ai.gelirGider(c, x, q)],

  ['GET', '/api/ayarlar', HERKES, (c, x) => ck.ayarlar(c, x)],
  ['PUT', '/api/ayarlar', [Y], (c, x, g) => ck.ayarlariKaydet(c, x, g), { yazma: true }],
  ['GET', '/api/kullanicilar', [Y], (c, x) => ck.kullanicilar(c, x)],
  ['POST', '/api/kullanicilar', [Y], (c, x, g) => ck.kullaniciEkle(c, x, g), { yazma: true }],
  ['PUT', '/api/kullanicilar/:id', [Y], (c, x, g, p) => ck.kullaniciGuncelle(c, x, p.id, g), { yazma: true }],
  ['GET', '/api/islem-kaydi', [Y], (c, x) => ck.islemKaydi(c, x)],
].map(([yontem, yol, roller, isle, sec = {}]) => {
  const adlar = [];
  const desen = new RegExp('^' + yol.replace(/\./g, '\\.').replace(/:(\w+)/g, (_, a) => (adlar.push(a), '([^/]+)')) + '$');
  return { yontem, desen, adlar, roller, isle, yazma: !!sec.yazma, govdesiz: !!sec.govdesiz, sinir: sec.sinir || 1024 * 1024 };
});

const GUVENLIK_BASLIKLARI = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
};

function gonder(res, status, veri, ekBasliklar = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...GUVENLIK_BASLIKLARI, ...ekBasliklar });
  res.end(JSON.stringify(veri));
}

async function govdeOku(req, sinir = 1024 * 1024) {
  // Başka siteden form gönderimine (CSRF) karşı: yazma istekleri yalnız JSON kabul eder.
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw hata('İstek JSON olmalı.', 415);
  const parcalar = [];
  let boyut = 0;
  for await (const p of req) {
    boyut += p.length;
    if (boyut > sinir) throw hata('İstek çok büyük.', 413);
    parcalar.push(p);
  }
  const m = Buffer.concat(parcalar).toString('utf8');
  let g;
  try { g = m ? JSON.parse(m) : {}; } catch { throw hata('İstek gövdesi geçerli JSON değil.'); }
  if (!g || typeof g !== 'object' || Array.isArray(g)) throw hata('İstek gövdesi bir nesne olmalı.');
  return g;
}

const ICERIK_TURLERI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function statikDosya(kok, req, res) {
  const url = new URL(req.url, 'http://x');
  let yol;
  try { yol = decodeURIComponent(url.pathname); } catch { return gonder(res, 400, { hata: 'Geçersiz adres.' }); }
  if (yol === '/' || !path.extname(yol)) yol = '/index.html';
  const tam = path.normalize(path.join(kok, yol));
  if (!tam.startsWith(kok + path.sep)) return gonder(res, 404, { hata: 'Bulunamadı.' });
  fs.readFile(tam, (e, veri) => {
    if (e) return gonder(res, 404, { hata: 'Bulunamadı.' });
    res.writeHead(200, { 'Content-Type': ICERIK_TURLERI[path.extname(tam)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...GUVENLIK_BASLIKLARI });
    res.end(veri);
  });
}

function istemciAdresi(req) {
  return (process.env.VEKIL_ARKASINDA === '1' && req.headers['x-real-ip']) || req.socket.remoteAddress || '';
}

function uygulamaOlustur(pool, { statikKok = path.join(__dirname, '..', 'public') } = {}) {
  return async function istek(req, res) {
    try {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return gonder(res, 405, { hata: 'İzin verilmeyen yöntem.' });
        return statikDosya(path.resolve(statikKok), req, res);
      }
      if (url.pathname === '/api/saglik') {
        await pool.query('SELECT 1');
        return gonder(res, 200, { durum: 'ok' });
      }
      if (url.pathname === '/api/giris' && req.method === 'POST') return await giris(pool, req, res);
      if (url.pathname === '/api/cikis' && req.method === 'POST') {
        await otr.oturumKapat(pool, req);
        return gonder(res, 200, { tamam: true }, { 'Set-Cookie': otr.cerezYaz('', { sil: true }) });
      }
      const kul = await otr.oturumuBul(pool, req);
      if (!kul) return gonder(res, 401, { hata: 'Oturum açmanız gerekiyor.' });
      if (url.pathname === '/api/ben' && req.method === 'GET') {
        const atanan = kul.rol === 'yonetici' ? [] : await st.kullaniciSiteleri(pool, kul.id);
        return gonder(res, 200, { ...kul, site_idler: atanan });
      }

      const sorgu = Object.fromEntries(url.searchParams);
      for (const y of YOLLAR) {
        if (y.yontem !== req.method) continue;
        const m = url.pathname.match(y.desen);
        if (!m) continue;
        if (!y.roller.includes(kul.rol)) return gonder(res, 403, { hata: 'Bu işlem için yetkiniz yok.' });
        let param;
        try { param = Object.fromEntries(y.adlar.map((a, i) => [a, decodeURIComponent(m[i + 1])])); } catch { throw hata('Geçersiz adres.'); }
        // Personelin site ataması varsa yalnız o siteleri görür; yönetici ve ataması olmayan personel bütün siteleri.
        const atanan = kul.rol === 'yonetici' ? [] : await st.kullaniciSiteleri(pool, kul.id);
        const ctx = { firma_id: kul.firma_id, kullanici_id: kul.id, rol: kul.rol, siteler: atanan.length ? atanan : null };
        let veri;
        if (!y.yazma) veri = await y.isle(pool, ctx, {}, param, sorgu);
        else {
          const govde = y.govdesiz ? {} : await govdeOku(req, y.sinir);
          veri = await islem(pool, (c) => y.isle(c, ctx, govde, param, sorgu));
        }
        if (veri && veri.__csv !== undefined) {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${String(veri.dosya).replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'no-store', ...GUVENLIK_BASLIKLARI });
          return res.end(veri.__csv);
        }
        return gonder(res, 200, veri);
      }
      return gonder(res, 404, { hata: 'Bulunamadı.' });
    } catch (e0) {
      const e = pgHatasiniCevir(e0);
      if (e instanceof HttpHata) return gonder(res, e.status, { hata: e.message });
      console.error(new Date().toISOString(), req.method, req.url, e);
      return gonder(res, 500, { hata: 'Beklenmeyen bir hata oluştu. Tekrar deneyin; sürerse destekle iletişime geçin.' });
    }
  };
}

async function giris(pool, req, res) {
  const g = await govdeOku(req);
  const eposta = (metin(g.eposta, 'E-posta', { zorunlu: true }) || '').toLowerCase();
  const parola = typeof g.parola === 'string' ? g.parola : '';
  const kilit = `${istemciAdresi(req)}|${eposta}`;
  otr.girisKilidi(kilit);
  const { rows: [k] } = await pool.query(
    `SELECT k.id, k.parola_ozet FROM kullanicilar k JOIN firmalar f ON f.id = k.firma_id WHERE lower(k.eposta) = $1 AND k.aktif AND f.aktif`, [eposta]);
  const dogru = otr.parolaDogrula(parola, k ? k.parola_ozet : SAHTE_OZET) && !!k;
  if (!dogru) {
    otr.hataliGirisYaz(kilit);
    throw hata('E-posta ya da parola hatalı.', 401);
  }
  otr.hataliGirisSifirla(kilit);
  const anahtar = await otr.oturumAc(pool, k.id);
  return gonder(res, 200, { tamam: true }, { 'Set-Cookie': otr.cerezYaz(anahtar) });
}
const SAHTE_OZET = otr.parolaOzetle('sahte-parola-karsilastirma');

module.exports = { uygulamaOlustur, YOLLAR };
