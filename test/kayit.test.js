'use strict';
process.env.VERI_ANAHTARI = Buffer.alloc(32, 7).toString('base64'); // yalnız test anahtarı
const test = require('node:test');
const assert = require('node:assert/strict');
const { ortamKur } = require('./yardimci');

let o;
const temel = { firma_ad: 'Deneme Yönetim', ad_soyad: 'Deneme Kişi', telefon: '0500 000 00 00', parola: 'deneme-parola-123', kvkk: true };
test.before(async () => { o = await ortamKur(); });
test.after(() => o?.kapat());

test('deneme kaydı: hesap açılır, oturum hemen başlar, örnek site dolu gelir, süre 14 gün', async () => {
  const i = o.istemci();
  const r = await i.post('/api/kayit', { ...temel, eposta: 'kayit1@deneme.test', ornek: true });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  assert.equal(r.veri.deneme_gun, 14);
  const ben = (await i.get('/api/ben')).veri;
  assert.equal(ben.firma_ad, 'Deneme Yönetim');
  assert.equal(ben.rol, 'yonetici');
  const kalan = (new Date(ben.deneme_bitis) - Date.now()) / 86400000;
  assert.ok(kalan > 13.9 && kalan <= 14, `kalan ${kalan}`);
  const siteler = (await i.get('/api/siteler')).veri;
  assert.equal(siteler[0].ad, 'Örnek Sitesi');
  assert.equal((await i.get('/api/daireler')).veri.length, 8);
  const oz = (await i.get('/api/aidat/ozet')).veri;
  assert.ok(oz.bu_ay_beklenen > 0 && oz.borclu_daire >= 1, JSON.stringify(oz));
  assert.equal((await i.get('/api/ayarlar')).veri.kira_modulu, false);
});

test('deneme kaydı: örneksiz boş başlar; aydınlatma onayı, telefon ve tuzak alan denetlenir; aynı e-posta ikinci kez açılamaz', async () => {
  const i = o.istemci();
  assert.equal((await i.post('/api/kayit', { ...temel, eposta: 'kayit2@deneme.test', kvkk: false })).status, 400);
  assert.equal((await i.post('/api/kayit', { ...temel, eposta: 'kayit2@deneme.test', telefon: '123' })).status, 400);
  assert.equal((await i.post('/api/kayit', { ...temel, eposta: 'kayit2@deneme.test', web_sitesi: 'http://spam' })).status, 400);
  const r = await i.post('/api/kayit', { ...temel, eposta: 'kayit2@deneme.test' });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  assert.equal((await i.get('/api/daireler')).veri.length, 0);
  assert.equal((await o.istemci().post('/api/kayit', { ...temel, eposta: 'KAYIT2@deneme.test' })).status, 409);
});

test('deneme süresi dolunca program kapanır, veriler silinmez; lisans verilince açılır', async () => {
  const i = o.istemci();
  assert.equal((await i.giris('kayit1@deneme.test', temel.parola)).status, 200);
  await o.pool.query(`UPDATE firmalar SET deneme_bitis = now() - interval '1 minute' WHERE ad = 'Deneme Yönetim' AND telefon IS NOT NULL AND id = (SELECT firma_id FROM kullanicilar WHERE eposta = 'kayit1@deneme.test')`);
  const ben = await i.get('/api/ben');
  assert.equal(ben.status, 200);
  assert.equal(ben.veri.deneme_bitti, true);
  const d = await i.get('/api/daireler');
  assert.equal(d.status, 402);
  assert.equal(d.veri.deneme_bitti, true);
  assert.equal((await i.post('/api/aidat/tahsilatlar', { daire_id: 1, tarih: '2026-01-01', tutar: 1 })).status, 402);
  await o.pool.query(`UPDATE firmalar SET deneme_bitis = NULL WHERE id = (SELECT firma_id FROM kullanicilar WHERE eposta = 'kayit1@deneme.test')`);
  assert.equal((await i.get('/api/daireler')).veri.length, 8, 'veriler duruyor');
});

test('aynı adresten saatte en çok 5 kayıt', async () => {
  // Bu dosyada şimdiye kadar başarılı 2 kayıt yapıldı (reddedilenler sayılmaz)
  for (const n of [3, 4, 5]) assert.equal((await o.istemci().post('/api/kayit', { ...temel, eposta: `kayit${n}@deneme.test` })).status, 200);
  const r = await o.istemci().post('/api/kayit', { ...temel, eposta: 'kayit6@deneme.test' });
  assert.equal(r.status, 429);
});
