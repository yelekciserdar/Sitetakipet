'use strict';
process.env.VERI_ANAHTARI = Buffer.alloc(32, 7).toString('base64'); // yalnız test anahtarı
const test = require('node:test');
const assert = require('node:assert/strict');
const { ortamKur } = require('./yardimci');
const { buAy, bugun, paylastir, aidatPaylari, yaziyla, vadeTarihi } = require('../lib/aidat');

const PAROLA = 'deneme-parola-123';
let o; let y; let p; let siteId; let site2;
const daire = {};

function ay(n, d = buAy()) {
  const [a, b] = d.split('-').map(Number);
  return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7);
}

test.before(async () => {
  o = await ortamKur();
  const f = await o.firma({ firma_ad: 'Deneme Yönetim', yonetici_ad: 'Deneme Yönetici', eposta: 'yonetici@deneme.test', parola: PAROLA, site_ad: 'Güneş Sitesi' });
  siteId = f.site_id;
  y = o.istemci();
  assert.equal((await y.giris('yonetici@deneme.test', PAROLA)).status, 200);
  site2 = (await y.post('/api/siteler', { ad: 'Lale Apartmanı' })).veri.id;
  for (const [no, m2, arsa] of [['1', 100, 40], ['2', 100, 40], ['3', 50, 20]]) {
    const r = await y.post('/api/daireler', { site_id: siteId, blok: 'A', daire_no: no, metrekare: m2 });
    assert.equal(r.status, 200, JSON.stringify(r.veri));
    daire[no] = { id: r.veri.id, arsa };
  }
  daire.lale = (await y.post('/api/daireler', { site_id: site2, daire_no: '1' })).veri.id;
  await y.post('/api/kullanicilar', { ad_soyad: 'Deneme Personel', eposta: 'personel@deneme.test', parola: PAROLA, rol: 'personel', site_idler: [site2] });
  p = o.istemci();
  assert.equal((await p.giris('personel@deneme.test', PAROLA)).status, 200);
});
test.after(() => o?.kapat());

test('paylaştırma kuruşu kuruşuna bütçeye eşit; özel aidat kalanı daraltır; eksik arsa payı açıkça söylenir', () => {
  const d = [{ id: 1, arsa_payi: 1 }, { id: 2, arsa_payi: 1 }, { id: 3, arsa_payi: 1 }];
  const p3 = paylastir('Arsa payı', 100000, d);
  assert.equal(p3.reduce((t, x) => t + x.kurus, 0), 100000);
  assert.deepEqual(p3.map((x) => x.kurus).sort(), [33333, 33333, 33334]);
  const oz = aidatPaylari('Eşit', 3000, [{ id: 1, aidat_ozel: 1000 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(oz.map((x) => x.tutar), [1000, 1000, 1000]);
  assert.throws(() => paylastir('Arsa payı', 100, [{ id: 1, daire_no: '5', blok: 'B' }]), /arsa payı bilgisi eksik \(B Blok 5\)/);
  assert.equal(vadeTarihi('2026-02', 28), '2026-02-28');
  assert.equal(yaziyla(1250.5), 'Yalnız binikiyüzelli Türk lirası elli kuruş');
  assert.equal(yaziyla(2000000), 'Yalnız ikimilyon Türk lirası');
});

test('aidat planı: personel kaydedemez; arsa payı eksikse reddedilir; tamamlanınca dağılım bütçeye eşit', async () => {
  const plan = { aidat_yontemi: 'Arsa payı', aidat_tutari: 5000, aidat_gunu: 10, aidat_baslangic: ay(-2), gecikme_orani: 5, iban: 'TR00 0000 0000 0000 0000 0000 99' };
  assert.equal((await p.put(`/api/aidat/plan/${site2}`, plan)).status, 403);
  const eksik = await y.put(`/api/aidat/plan/${siteId}`, plan);
  assert.equal(eksik.status, 400);
  assert.match(eksik.veri.hata, /3 dairenin arsa payı bilgisi eksik/);
  for (const no of ['1', '2', '3']) assert.equal((await y.put(`/api/aidat/daire/${daire[no].id}`, { arsa_payi: daire[no].arsa })).status, 200);
  const r = await y.put(`/api/aidat/plan/${siteId}`, { ...plan, gecikme_orani: 6 });
  assert.equal(r.status, 400, 'KMK: aylık %5 üstü gecikme tazminatı kabul edilmez');
  const ok = await y.put(`/api/aidat/plan/${siteId}`, plan);
  assert.equal(ok.status, 200, JSON.stringify(ok.veri));
  assert.equal(ok.veri.aylik_toplam, 5000);
  assert.deepEqual(ok.veri.daireler.map((d) => d.aylik_aidat), [2000, 2000, 1000]);
  assert.equal(ok.veri.iban, 'TR000000000000000000000099');
});

test('tahakkuk: geçmiş ve bu ay borçları oluşur, ikinci çalıştırma çift borç yazmaz, plansız site atlanır', async () => {
  for (const d of [ay(-2), ay(-1), buAy()]) {
    const r = await y.post('/api/aidat/tahakkuk', { donem: d });
    assert.equal(r.status, 200, JSON.stringify(r.veri));
    assert.equal(r.veri.olusan, 3);
  }
  assert.equal((await y.post('/api/aidat/tahakkuk', { donem: buAy() })).veri.olusan, 0);
  assert.equal((await y.post('/api/aidat/tahakkuk', { donem: ay(-3) })).veri.olusan, 0, 'plan başlangıcından önceki ay yazılmaz');
  const b = (await y.get(`/api/aidat/borclar?daire_id=${daire['1'].id}`)).veri;
  assert.equal(b.length, 3);
  assert.ok(b.every((x) => x.tutar === 2000 && x.tur === 'Aidat'));
  assert.equal(b.find((x) => x.donem === ay(-2)).vade, `${ay(-2)}-10`);
});

test('tahsilat: en eski borçtan kapanır, fazlası avans olur, makbuz numarası sırayla verilir ve yazıyla yazılır', async () => {
  const d1 = daire['1'].id;
  const t1 = await y.post('/api/aidat/tahsilatlar', { daire_id: d1, tarih: bugun(), tutar: 3000, odeme_turu: 'Nakit', odeyen: 'Deneme Malik' });
  assert.equal(t1.status, 200, JSON.stringify(t1.veri));
  assert.equal(t1.veri.makbuz_no, 1);
  let h = (await y.get(`/api/aidat/daire/${d1}`)).veri;
  const durum = Object.fromEntries(h.borclar.map((x) => [x.donem, x.durum]));
  assert.equal(durum[ay(-2)], 'Ödendi');
  assert.notEqual(durum[ay(-1)], 'Ödendi');
  assert.equal(h.bakiye, 3000);
  const m = (await y.get(`/api/aidat/makbuz/${t1.veri.id}`)).veri;
  assert.equal(m.yaziyla, 'Yalnız üçbin Türk lirası');
  assert.deepEqual(m.kalemler.map((k) => [k.donem, k.tutar]), [[ay(-2), 2000], [ay(-1), 1000]]);
  assert.equal(m.firma, 'Deneme Yönetim');
  const t2 = await y.post('/api/aidat/tahsilatlar', { daire_id: d1, tarih: bugun(), tutar: 4000, odeme_turu: 'Havale/EFT' });
  assert.equal(t2.veri.makbuz_no, 2);
  h = (await y.get(`/api/aidat/daire/${d1}`)).veri;
  assert.equal(h.bakiye, 0);
  assert.equal(h.avans, 1000);
  assert.equal((await y.get(`/api/aidat/makbuz/${t2.veri.id}`)).veri.avans, 1000);
  // İptal: dağılım yeniden hesaplanır, makbuz numarası boşa düşmez ama yeniden kullanılmaz
  assert.equal((await p.post(`/api/aidat/tahsilatlar/${t2.veri.id}/iptal`, { neden: 'deneme' })).status, 403);
  assert.equal((await y.post(`/api/aidat/tahsilatlar/${t2.veri.id}/iptal`, { neden: 'Yanlış daire' })).status, 200);
  h = (await y.get(`/api/aidat/daire/${d1}`)).veri;
  assert.equal(h.bakiye, 3000);
  assert.equal((await y.post('/api/aidat/tahsilatlar', { daire_id: d1, tarih: bugun(), tutar: 1 })).veri.makbuz_no, 3);
});

test('ek toplama: metrekareye göre paylaşılır, iptal edilince borçlar kalkar ve ödeme yeniden dağılır', async () => {
  const r = await y.post('/api/aidat/ek-toplamalar', { site_id: siteId, aciklama: 'Çatı onarımı', toplam: 25000, yontem: 'Metrekare', vade: `${buAy()}-28` });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  const b3 = (await y.get(`/api/aidat/borclar?daire_id=${daire['3'].id}`)).veri.filter((x) => x.tur === 'Ek Toplama');
  assert.equal(b3.length, 1);
  assert.equal(b3[0].tutar, 5000);
  assert.equal(b3[0].aciklama, 'Çatı onarımı');
  assert.equal((await y.get('/api/aidat/ek-toplamalar')).veri[0].toplam, 25000);
  assert.equal((await y.post(`/api/aidat/ek-toplamalar/${r.veri.id}/iptal`, { neden: 'Teklif yenilenecek' })).status, 200);
  assert.equal((await y.get(`/api/aidat/borclar?daire_id=${daire['3'].id}`)).veri.filter((x) => x.tur === 'Ek Toplama').length, 0);
});

test('borçlular: geciken daireler, gecikme tazminatı ve hazır hatırlatma metni', async () => {
  // A2'ye malik bilgisi: hatırlatma ona gider (kiracı yok)
  const e = await y.put(`/api/daireler/${daire['2'].id}`, { daire_no: '2', blok: 'A', metrekare: 100, ev_sahibi: { ad_soyad: 'Ayşe Kaya', telefon: '0555 000 00 02' }, ev_sahibi_oturuyor: true });
  assert.equal(e.status, 200, JSON.stringify(e.veri));
  const l = (await y.get('/api/aidat/borclular')).veri;
  const a2 = l.find((x) => x.daire_id === daire['2'].id);
  assert.ok(a2, 'iki aylık borcu olan daire listede');
  assert.equal(a2.muhatap, 'Ayşe Kaya');
  assert.ok(a2.geciken_tutar >= 2000);
  assert.ok(a2.tazminat > 0, 'aylık %5 tazminat hesaplanır');
  assert.match(a2.mesaj, /Sayın Ayşe Kaya, Güneş Sitesi A Blok 2 için .* aidat ödemeniz \d+ gündür gecikmiştir\. Ödemenizi TR000000000000000000000099/);
  assert.match(a2.whatsapp, /^https:\/\/wa\.me\/905550000002\?text=/);
  const oz = (await y.get('/api/aidat/ozet')).veri;
  assert.ok(oz.borclu_daire >= 2);
  assert.ok(oz.tazminat_toplam > 0);
});

test('giderler ve kasa: tahsilat − gider; personel gider girebilir ama silemez; gelir-gider raporu yöneticiye', async () => {
  const g = await p.post('/api/giderler', { site_id: site2, tarih: bugun(), kategori: 'Temizlik', tutar: 1500 });
  assert.equal(g.status, 200, JSON.stringify(g.veri));
  assert.equal((await p.post('/api/giderler', { site_id: siteId, tarih: bugun(), kategori: 'Su', tutar: 10 })).status, 404, 'atanmadığı siteye gider giremez');
  assert.equal((await y.post('/api/giderler', { site_id: siteId, tarih: bugun(), kategori: 'Elektrik', tutar: 800, belge_no: 'F-1' })).status, 200);
  assert.equal((await p.post(`/api/giderler/${g.veri.id}/iptal`, { neden: 'x' })).status, 403);
  assert.equal((await p.get('/api/gelir-gider')).status, 403);
  const r = (await y.get('/api/gelir-gider')).veri;
  const gunes = r.siteler.find((s) => s.site_id === siteId);
  assert.equal(gunes.gelir, 3001);
  assert.equal(gunes.gider, 800);
  assert.equal(gunes.kasa, 2201);
  assert.equal(r.kategoriler.find((k) => k.kategori === 'Temizlik').tutar, 1500);
});

test('site yetkisi: personel atanmadığı sitenin dairesini, makbuzunu, borçlarını göremez', async () => {
  assert.equal((await p.get(`/api/aidat/daire/${daire['1'].id}`)).status, 404);
  assert.equal((await p.get('/api/aidat/makbuz/1')).status, 404);
  assert.equal((await p.get(`/api/aidat/plan/${siteId}`)).status, 404);
  assert.equal((await p.get('/api/aidat/borclar')).veri.length, 0);
  assert.equal((await p.post('/api/aidat/tahsilatlar', { daire_id: daire['1'].id, tarih: bugun(), tutar: 10 })).status, 404);
  assert.equal((await p.post('/api/aidat/tahsilatlar', { daire_id: daire.lale, tarih: bugun(), tutar: 10 })).status, 200);
});

test('firma ayrımı: başka firma hiçbir aidat kaydını göremez ve değiştiremez', async () => {
  await o.firma({ firma_ad: 'Başka Firma', yonetici_ad: 'Başka Yönetici', eposta: 'baska@deneme.test', parola: PAROLA });
  const b = o.istemci();
  assert.equal((await b.giris('baska@deneme.test', PAROLA)).status, 200);
  assert.equal((await b.get(`/api/aidat/daire/${daire['1'].id}`)).status, 404);
  assert.equal((await b.get('/api/aidat/makbuz/1')).status, 404);
  assert.equal((await b.get(`/api/aidat/plan/${siteId}`)).status, 404);
  assert.equal((await b.put(`/api/aidat/plan/${siteId}`, { aidat_yontemi: 'Sabit', aidat_tutari: 1 })).status, 404);
  assert.equal((await b.put(`/api/aidat/daire/${daire['1'].id}`, { arsa_payi: 1 })).status, 404);
  assert.equal((await b.post('/api/aidat/tahsilatlar', { daire_id: daire['1'].id, tarih: bugun(), tutar: 10 })).status, 404);
  assert.equal((await b.post('/api/aidat/tahsilatlar/1/iptal', { neden: 'x' })).status, 404);
  assert.equal((await b.post('/api/aidat/borclar/1/iptal', { neden: 'x' })).status, 404);
  assert.equal((await b.post('/api/aidat/ek-toplamalar/1/iptal', { neden: 'x' })).status, 404);
  assert.equal((await b.post('/api/giderler/1/iptal', { neden: 'x' })).status, 404);
  assert.equal((await b.post('/api/aidat/ek-toplamalar', { site_id: siteId, aciklama: 'x', toplam: 1, vade: bugun() })).status, 404);
  for (const yol of ['/api/aidat/borclar', '/api/aidat/borclular', '/api/aidat/tahsilatlar', '/api/aidat/ek-toplamalar', '/api/giderler']) {
    assert.deepEqual((await b.get(yol)).veri, [], yol);
  }
  const oz = (await b.get('/api/aidat/ozet')).veri;
  assert.equal(oz.toplam_alacak, 0);
  assert.equal(oz.kasa, 0);
  assert.equal((await b.post('/api/aidat/tahakkuk', { donem: buAy() })).veri.olusan, 0);
});

test('kira bölümü yeni firmada kapalı, ayarlardan açılır', async () => {
  assert.equal((await y.get('/api/ayarlar')).veri.kira_modulu, false);
  const a = (await y.get('/api/ayarlar')).veri;
  const r = await y.put('/api/ayarlar', { ...a, kira_modulu: true });
  assert.equal(r.status, 200);
  assert.equal(r.veri.kira_modulu, true);
});
