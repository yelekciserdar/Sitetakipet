'use strict';
process.env.VERI_ANAHTARI = Buffer.alloc(32, 7).toString('base64'); // yalnız test anahtarı
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { ortamKur } = require('./yardimci');
const { bugun, buAy } = require('../lib/kira');
const { adEslesir } = require('../lib/banka');

const PAROLA = 'deneme-parola-123';
let o; let y; let p;

// YYYY-AA dönemini n ay kaydırır
function ay(n, d = buAy()) {
  const [a, b] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, b - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}
// Algoritmaya uygun deneme T.C. kimlik no üretir
function denemeTc(ilk9 = '100000001') {
  const h = ilk9.split('').map(Number);
  const d10 = ((((h[0] + h[2] + h[4] + h[6] + h[8]) * 7 - (h[1] + h[3] + h[5] + h[7])) % 10) + 10) % 10;
  const d11 = (h.reduce((a, b) => a + b, 0) + d10) % 10;
  return ilk9 + d10 + d11;
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test.before(async () => {
  o = await ortamKur();
  await o.firma({ firma_ad: 'Deneme Gayrimenkul', yonetici_ad: 'Deneme Yönetici', eposta: 'yonetici@deneme.test', parola: PAROLA });
  y = o.istemci();
  assert.equal((await y.giris('yonetici@deneme.test', PAROLA)).status, 200);
  await y.post('/api/kullanicilar', { ad_soyad: 'Deneme Personel', eposta: 'personel@deneme.test', parola: PAROLA, rol: 'personel' });
  p = o.istemci();
  assert.equal((await p.giris('personel@deneme.test', PAROLA)).status, 200);
});
test.after(() => o?.kapat());

let daireA; let daireB; let sozA; let sozB;

test('daire ekleme; aynı blokta aynı numara reddedilir; personel daire ekleyemez', async () => {
  const a = await y.post('/api/daireler', { daire_no: '15', blok: 'A', kat: '5', metrekare: 85, oda: '3+1' });
  assert.equal(a.status, 200);
  daireA = a.veri.id;
  assert.equal((await y.post('/api/daireler', { daire_no: '15', blok: 'a' })).status, 409);
  const b = await y.post('/api/daireler', { daire_no: '15', blok: 'B' });
  assert.equal(b.status, 200);
  daireB = b.veri.id;
  assert.equal((await p.post('/api/daireler', { daire_no: '99' })).status, 403);
  const l = (await p.get('/api/daireler')).veri;
  assert.equal(l.length, 2);
  assert.ok(l.every((d) => d.durum === 'Boş'));
});

test('kiracı yerleştirme: bu ayın borcu oluşur, daire dolu olur, ikinci aktif kiracı reddedilir', async () => {
  const r = await y.post('/api/sozlesmeler', {
    daire_id: daireA, baslangic: `${ay(-4)}-01`, aylik_kira: 30000, depozito: 30000, odeme_gunu: 5,
    kisi: { ad_soyad: 'Mehmet Demir', telefon: '0555 000 00 01', odeme_kodu: 'a15', iban: 'TR00 0000 0000 0000 0000 0000 01' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  sozA = r.veri.id;
  assert.equal(r.veri.borclar.length, 1);
  assert.equal(r.veri.borclar[0].donem, buAy());
  assert.equal(r.veri.borclar[0].tutar, 30000);
  assert.equal((await y.post('/api/sozlesmeler', { daire_id: daireA, baslangic: bugun(), aylik_kira: 1, kisi: { ad_soyad: 'Başka' } })).status, 409);
  const d = (await y.get('/api/daireler')).veri.find((x) => x.id === daireA);
  assert.equal(d.durum, 'Dolu');
  assert.equal(d.ad_soyad, 'Mehmet Demir');
});

test('geçmiş dönem borcu elle oluşturulur, iki kez oluşturulsa da çift borç olmaz; gecikenler', async () => {
  for (const n of [-2, -1, -2]) assert.equal((await y.post('/api/borclar/olustur', { donem: ay(n) })).status, 200);
  const b = (await y.get(`/api/borclar?sozlesme_id=${sozA}`)).veri;
  assert.equal(b.length, 3);
  const eski = b.find((x) => x.donem === ay(-2));
  assert.equal(eski.durum, 'Gecikti');
  assert.ok(eski.gecikme_gun > 20);
  const g = (await p.get('/api/gecikenler')).veri;
  assert.equal(g.length, 1);
  assert.ok(g[0].geciken_tutar >= 60000);
  assert.match(g[0].sms, /Sayın Mehmet Demir, Ana Site A Blok 15 için (Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) \d{4}/);
  assert.match(g[0].whatsapp, /^https:\/\/wa\.me\/905550000001\?text=/);
});

test('ödeme en eski borçtan başlayarak düşer; kısmi ödeme durumu', async () => {
  const r = await p.post('/api/tahsilatlar', { sozlesme_id: sozA, tarih: bugun(), tutar: 45000, odeme_turu: 'Havale/EFT' });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  const b = (await y.get(`/api/borclar?sozlesme_id=${sozA}`)).veri;
  assert.equal(b.find((x) => x.donem === ay(-2)).durum, 'Ödendi');
  const ikinci = b.find((x) => x.donem === ay(-1));
  assert.equal(ikinci.odenen, 15000);
  assert.equal(ikinci.kalan, 15000);
  assert.notEqual(ikinci.durum, 'Bekliyor');
});

test('fazla ödeme kaybolmaz: avans olur ve yeni ayın borcuna kendiliğinden düşer (Excel hatası)', async () => {
  // Kalan: 15.000 (geçen ay) + 30.000 (bu ay) = 45.000; 50.000 ödenince 5.000 avans
  await y.post('/api/tahsilatlar', { sozlesme_id: sozA, tarih: bugun(), tutar: 50000 });
  let s = (await y.get(`/api/sozlesmeler/${sozA}`)).veri;
  assert.equal(s.avans, 5000);
  assert.equal(s.bakiye, 0);
  assert.ok(s.borclar.every((b) => b.durum === 'Ödendi'));
  await y.post('/api/borclar/olustur', { donem: ay(1) });
  s = (await y.get(`/api/sozlesmeler/${sozA}`)).veri;
  const gelecek = s.borclar.find((b) => b.donem === ay(1));
  assert.equal(gelecek.odenen, 5000);
  assert.equal(gelecek.kalan, 25000);
  assert.equal(s.avans, 0);
});

test('ödeme iptali yeniden dağıtır; ileri tarihli ödeme reddedilir; personel iptal edemez', async () => {
  const s = (await y.get(`/api/sozlesmeler/${sozA}`)).veri;
  const son = s.tahsilatlar.find((t) => t.tutar === 50000);
  assert.equal((await p.post(`/api/tahsilatlar/${son.id}/iptal`, { neden: 'deneme' })).status, 403);
  assert.equal((await y.post(`/api/tahsilatlar/${son.id}/iptal`, {})).status, 400);
  assert.equal((await y.post(`/api/tahsilatlar/${son.id}/iptal`, { neden: 'Yanlış giriş' })).status, 200);
  const s2 = (await y.get(`/api/sozlesmeler/${sozA}`)).veri;
  assert.equal(s2.bakiye, 15000 + 30000 + 30000);
  assert.equal(s2.borclar.find((b) => b.donem === ay(1)).odenen, 0);
  const yarin = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await y.post('/api/tahsilatlar', { sozlesme_id: sozA, tarih: yarin, tutar: 10 })).status, 400);
});

test('kira artışı yalnız sonraki aylara; "bu ay da" seçilirse bu ayın borcu da güncellenir', async () => {
  const r = await y.put(`/api/sozlesmeler/${sozA}`, { aylik_kira: 33000 });
  assert.equal(r.status, 200);
  assert.equal(r.veri.aylik_kira, 33000);
  assert.equal(r.veri.depozito, 30000); // gönderilmeyen alan korunur
  assert.equal(r.veri.borclar.find((b) => b.donem === buAy()).tutar, 30000);
  const r2 = await y.put(`/api/sozlesmeler/${sozA}`, { aylik_kira: 33000, bu_ay_da: true });
  assert.equal(r2.veri.borclar.find((b) => b.donem === buAy()).tutar, 33000);
});

test('T.C. kimlik no: geçersiz reddedilir, şifreli saklanır, listede son 4 hane, açık hâli yalnız yönetici ve kayıtlı', async () => {
  const k = (await y.get(`/api/sozlesmeler/${sozA}`)).veri.kisi_id;
  const temel = { ad_soyad: 'Mehmet Demir', telefon: '0555 000 00 01', odeme_kodu: 'A15', iban: 'TR000000000000000000000001' };
  assert.equal((await y.put(`/api/kisiler/${k}`, { ...temel, tc: '12345678901' })).status, 400);
  const tc = denemeTc();
  assert.equal((await y.put(`/api/kisiler/${k}`, { ...temel, tc })).status, 200);
  const satir = await o.pool.query('SELECT tc_sifreli, tc_son4 FROM kisiler WHERE id = $1', [k]);
  assert.ok(!satir.rows[0].tc_sifreli.includes(tc));
  assert.equal(satir.rows[0].tc_son4, tc.slice(-4));
  const liste = (await p.get('/api/kisiler')).veri;
  assert.equal(liste[0].tc_son4, tc.slice(-4));
  assert.equal(liste[0].tc_sifreli, undefined);
  assert.equal((await p.get(`/api/kisiler/${k}/tc`)).status, 403);
  assert.equal((await y.get(`/api/kisiler/${k}/tc`)).veri.tc, tc);
  // T.C. gönderilmeden güncelleme mevcut değeri korur
  await y.put(`/api/kisiler/${k}`, { ...temel, notlar: 'not' });
  assert.equal((await y.get(`/api/kisiler/${k}/tc`)).veri.tc, tc);
  const kayit = (await y.get('/api/islem-kaydi')).veri;
  assert.ok(kayit.some((x) => x.tur === 'T.C. kimlik no görüntülendi'));
});

test('ad eşleştirmesi tam kelime ister (Excel\'de "Ali", "Aliye" ile eşleşiyordu)', () => {
  assert.equal(adEslesir('aliye canan kira', 'Ali Can'), false);
  assert.equal(adEslesir('ali can kira odemesi', 'Ali Can'), true);
  assert.equal(adEslesir('kira odemesi mehmet demir', 'Mehmet Demir'), true);
  assert.equal(adEslesir('ali kira', 'Ali'), false); // tek ve kısa ad yeterli sayılmaz
});

test('banka ekstresi (CSV): kod + tutar ile otomatik eşleşme, aynı ekstre ikinci kez yüklenince mükerrer girmez', async () => {
  const s = await y.post('/api/sozlesmeler', { daire_id: daireB, baslangic: `${buAy()}-01`, aylik_kira: 20000, odeme_gunu: 1, kisi: { ad_soyad: 'Ayşe Kaya' } });
  sozB = s.veri.id;
  const csv = [
    'Hesap Hareketleri',
    'Tarih;Açıklama;Tutar;Gönderen;IBAN',
    `${bugun().split('-').reverse().join('.')};KIRA A15 ODEMESI;15.000,00;MEHMET DEMIR;TR00 0000 0000 0000 0000 0000 01`,
    `${bugun().split('-').reverse().join('.')};AYSE KAYA KIRA;20.000,00;AYSE KAYA;`,
    `${bugun().split('-').reverse().join('.')};MARKET ALISVERISI;-350,00;;`,
    `${bugun().split('-').reverse().join('.')};BILINMEYEN HAVALE;777,00;X Y;`,
  ].join('\r\n');
  const r = await y.post('/api/banka/yukle', { dosya_adi: 'ekstre.csv', icerik_base64: b64(csv) });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  assert.equal(r.veri.eklenen, 3);
  assert.equal(r.veri.atlanan, 1); // giden hareket
  assert.equal(r.veri.otomatik, 2);
  assert.equal(r.veri.eslesmedi, 1);
  const sB = (await y.get(`/api/sozlesmeler/${sozB}`)).veri;
  assert.equal(sB.bakiye, 0);
  const ikinci = await y.post('/api/banka/yukle', { dosya_adi: 'ekstre.csv', icerik_base64: b64(csv) });
  assert.equal(ikinci.veri.eklenen, 0);
  assert.equal(ikinci.veri.mukerrer, 3);
  assert.equal((await y.get(`/api/sozlesmeler/${sozB}`)).veri.toplam_odeme, 20000);
});

test('banka: eşleşmeyen hareket elle eşleştirilir ya da yok sayılır; ödemeye dönüşmüş hareket yeniden eşleştirilemez', async () => {
  const acik = (await y.get('/api/banka?durum=A%C3%A7%C4%B1k')).veri;
  assert.equal(acik.length, 1);
  const h = acik[0];
  assert.equal((await y.post(`/api/banka/${h.id}/eslestir`, { sozlesme_id: sozB })).status, 200);
  assert.equal((await y.post(`/api/banka/${h.id}/eslestir`, { sozlesme_id: sozA })).status, 409);
  assert.equal((await y.post(`/api/banka/${h.id}/yok-say`, {})).status, 409);
  const sB = (await y.get(`/api/sozlesmeler/${sozB}`)).veri;
  assert.equal(sB.avans, 777);
  assert.equal((await p.get('/api/banka')).status, 403);
});

// Deflate sıkıştırmalı en küçük XLSX'i test içinde üretir.
function xlsxUret(satirlar) {
  const xmlKac = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const harf = (i) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    satirlar.map((s, r) => `<row r="${r + 1}">${s.map((v, c) => (typeof v === 'number'
      ? `<c r="${harf(c)}${r + 1}"><v>${v}</v></c>`
      : `<c r="${harf(c)}${r + 1}" t="inlineStr"><is><t>${xmlKac(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const dosyalar = [
    ['xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sayfa1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  const yerel = []; const merkez = []; let ofset = 0;
  for (const [ad, icerik] of dosyalar) {
    const ham = Buffer.from(icerik); const sik = zlib.deflateRawSync(ham); const adB = Buffer.from(ad);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(sik.length, 18); lh.writeUInt32LE(ham.length, 22); lh.writeUInt16LE(adB.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(sik.length, 20); ch.writeUInt32LE(ham.length, 24); ch.writeUInt16LE(adB.length, 28); ch.writeUInt32LE(ofset, 42);
    yerel.push(lh, adB, sik); merkez.push(ch, adB); ofset += 30 + adB.length + sik.length;
  }
  const merkezB = Buffer.concat(merkez);
  const son = Buffer.alloc(22); son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(dosyalar.length, 8); son.writeUInt16LE(dosyalar.length, 10);
  son.writeUInt32LE(merkezB.length, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yerel, merkezB, son]);
}

test('banka ekstresi (XLSX, Excel tarih sayısı ve ayrı Alacak sütunu) okunur', async () => {
  const seri = Math.round(new Date(bugun() + 'T00:00:00Z').getTime() / 86400000) + 25569;
  const buf = xlsxUret([
    ['İşlem Tarihi', 'Açıklama', 'Borç', 'Alacak', 'Gönderen'],
    [seri, 'A15 KIRA', '', 1000, 'MEHMET DEMIR'],
    [seri, 'FATURA', 250, '', ''],
  ]);
  const r = await y.post('/api/banka/yukle', { dosya_adi: 'ekstre.xlsx', icerik_base64: buf.toString('base64') });
  assert.equal(r.status, 200, JSON.stringify(r.veri));
  assert.equal(r.veri.eklenen, 1);
  assert.equal(r.veri.atlanan, 1);
  const h = (await y.get('/api/banka')).veri.find((x) => x.dosya === 'ekstre.xlsx');
  assert.equal(h.tarih, bugun());
  assert.equal(h.tutar, 1000);
  assert.ok(['Otomatik Eşleşti', 'Kontrol Gerekli'].includes(h.durum));
});

test('geçersiz ekstre anlaşılır uyarı verir', async () => {
  assert.equal((await y.post('/api/banka/yukle', { dosya_adi: 'x.csv', icerik_base64: b64('a;b;c\n1;2;3') })).status, 400);
  const xls = Buffer.alloc(16); xls.writeUInt32LE(0xe011cfd0, 0);
  const r = await y.post('/api/banka/yukle', { dosya_adi: 'eski.xls', icerik_base64: xls.toString('base64') });
  assert.equal(r.status, 400);
  assert.match(r.veri.hata, /xlsx/i);
});

test('kiracı ayrıldı: ileri ay borçları iptal, açık borç alacak olarak kalır, daire boşalır', async () => {
  const r = await y.post(`/api/sozlesmeler/${sozA}/ayril`, { tarih: bugun() });
  assert.equal(r.status, 200);
  assert.equal(r.veri.durum, 'Ayrıldı');
  assert.equal(r.veri.aylik_kira, 33000); // kira tutarı sıfırlanmaz
  assert.ok(!r.veri.borclar.some((b) => b.donem === ay(1)));
  assert.ok(r.veri.bakiye > 0);
  const d = (await y.get('/api/daireler')).veri.find((x) => x.id === daireA);
  assert.equal(d.durum, 'Boş');
  assert.ok((await y.get('/api/borclar?durum=A%C3%A7%C4%B1k')).veri.some((b) => b.sozlesme_id === sozA));
  assert.equal((await y.post(`/api/sozlesmeler/${sozA}/ayril`, {})).status, 400);
});

test('özet ve rapor (CSV, formül enjeksiyonuna karşı korumalı)', async () => {
  const oz = (await p.get('/api/ozet')).veri;
  assert.equal(oz.daire_toplam, 2);
  assert.equal(oz.daire_dolu, 1);
  assert.ok(oz.toplam_alacak > 0);
  assert.equal(oz.aylar.length, 12);
  const k = (await y.get(`/api/sozlesmeler/${sozB}`)).veri.kisi_id;
  await y.put(`/api/kisiler/${k}`, { ad_soyad: '=HYPERLINK("x")' });
  const r = await y.get(`/api/rapor?baslangic=${ay(-3)}&bitis=${ay(1)}`);
  assert.equal(r.status, 200);
  assert.ok(r.veri.satirlar.length >= 4);
  const csv = await fetch(`${o.taban}/api/rapor.csv?baslangic=${ay(-3)}&bitis=${ay(1)}`, { headers: { Cookie: y.cerez() } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const ham = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...ham.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // Excel Türkçe karakterleri doğru açsın diye UTF-8 BOM
  const metin = ham.toString('utf8');
  assert.ok(metin.startsWith('﻿Dönem;Site;Blok;Daire;Kiracı'));
  assert.ok(metin.includes(`"'=HYPERLINK(""x"")"`));
  assert.equal((await p.get(`/api/rapor?baslangic=${ay(-3)}&bitis=${ay(1)}`)).status, 403);
});

test('firma ayrımı: başka firma veriyi göremez ve değiştiremez', async () => {
  await o.firma({ firma_ad: 'Başka Firma', yonetici_ad: 'Başka', eposta: 'baska@deneme.test', parola: PAROLA });
  const b = o.istemci();
  await b.giris('baska@deneme.test', PAROLA);
  assert.equal((await b.get('/api/daireler')).veri.length, 0);
  assert.equal((await b.get('/api/borclar')).veri.length, 0);
  assert.equal((await b.get(`/api/sozlesmeler/${sozB}`)).status, 404);
  assert.equal((await b.post('/api/tahsilatlar', { sozlesme_id: sozB, tarih: bugun(), tutar: 1 })).status, 404);
  assert.equal((await b.post(`/api/sozlesmeler/${sozB}/ayril`, {})).status, 404);
  assert.equal((await b.post('/api/sozlesmeler', { daire_id: daireB, baslangic: bugun(), aylik_kira: 1, kisi: { ad_soyad: 'X' } })).status, 404);
  const h = (await y.get('/api/banka')).veri[0];
  assert.equal((await b.post(`/api/banka/${h.id}/yok-say`, {})).status, 404);
  assert.equal((await b.get(`/api/kisiler/${(await y.get('/api/kisiler')).veri[0].id}/tc`)).status, 404);
  // Otomatik tahakkuk başka firmanın sözleşmesine borç yazmaz
  await b.post('/api/borclar/olustur', { donem: buAy() });
  assert.equal((await b.get('/api/borclar')).veri.length, 0);
});

test('hatalı girdiler 400 döner, sunucu hatası olmaz', async () => {
  for (const g of [
    { daire_id: 'x', baslangic: bugun(), aylik_kira: 1, kisi: { ad_soyad: 'X' } },
    { daire_id: daireB, baslangic: '2026-02-30', aylik_kira: 1, kisi: { ad_soyad: 'X' } },
    { daire_id: daireB, baslangic: bugun(), aylik_kira: -5, kisi: { ad_soyad: 'X' } },
    { daire_id: daireB, baslangic: bugun(), aylik_kira: 1e30, kisi: { ad_soyad: 'X' } },
    { daire_id: daireB, baslangic: bugun(), aylik_kira: 1, odeme_gunu: 40, kisi: { ad_soyad: 'X' } },
    { daire_id: daireB, baslangic: bugun(), bitis: '2000-01-01', aylik_kira: 1, kisi: { ad_soyad: 'X' } },
  ]) {
    const r = await y.post('/api/sozlesmeler', g);
    assert.equal(r.status, 400, JSON.stringify(g) + ' → ' + JSON.stringify(r.veri));
  }
  assert.equal((await y.post('/api/borclar/olustur', { donem: '2026-13' })).status, 400);
  assert.equal((await y.post('/api/kisiler', { ad_soyad: 'X', iban: 'TR12' })).status, 400);
  assert.equal((await y.put('/api/ayarlar', { ad: 'X', gecikme_gun: 100, yaklasan_gun: 3, varsayilan_odeme_gunu: 5 })).status, 400);
  assert.equal((await y.get('/api/sozlesmeler/abc')).status, 400);
  assert.equal((await y.get('/api/rapor?baslangic=2026-05&bitis=2026-01')).status, 400);
});

test('çoklu site: aynı daire no farklı sitede açılır, site süzgeci, personelin site yetkisi sunucuda da uygulanır', async () => {
  const ana = (await y.get('/api/siteler')).veri[0];
  assert.equal(ana.ad, 'Ana Site');
  const gunes = await y.post('/api/siteler', { ad: 'Güneş Sitesi', adres: 'Deneme Mah.' });
  assert.equal(gunes.status, 200);
  assert.equal((await y.post('/api/siteler', { ad: 'güneş sitesi' })).status, 409);
  assert.equal((await p.post('/api/siteler', { ad: 'Yetkisiz' })).status, 403);
  // İki aktif site varken site seçmeden daire eklenemez; aynı "A Blok 15" başka sitede açılabilir
  assert.equal((await y.post('/api/daireler', { daire_no: '15', blok: 'A' })).status, 400);
  const gd = await y.post('/api/daireler', { site_id: gunes.veri.id, daire_no: '15', blok: 'A' });
  assert.equal(gd.status, 200);
  const gs = await y.post('/api/sozlesmeler', { daire_id: gd.veri.id, baslangic: `${ay(-1)}-01`, aylik_kira: 10000, odeme_gunu: 1, kisi: { ad_soyad: 'Güneş Kiracı' } });
  assert.equal(gs.status, 200);
  assert.equal(gs.veri.site, 'Güneş Sitesi');
  await y.post('/api/borclar/olustur', { donem: ay(-1) });
  // Site süzgeci
  const sadeceGunes = (await y.get(`/api/daireler?site_id=${gunes.veri.id}`)).veri;
  assert.equal(sadeceGunes.length, 1);
  assert.equal((await y.get(`/api/ozet?site_id=${gunes.veri.id}`)).veri.daire_toplam, 1);
  assert.ok((await y.get(`/api/gecikenler?site_id=${gunes.veri.id}`)).veri.every((g) => g.site === 'Güneş Sitesi'));
  assert.match((await y.get(`/api/gecikenler?site_id=${gunes.veri.id}`)).veri[0].sms, /Güneş Sitesi A Blok 15 için/);
  // Personeli yalnız Güneş Sitesi'ne ata
  const per = (await y.get('/api/kullanicilar')).veri.find((k) => k.eposta === 'personel@deneme.test');
  assert.equal((await y.put(`/api/kullanicilar/${per.id}`, { site_idler: [gunes.veri.id] })).status, 200);
  assert.deepEqual((await y.get('/api/kullanicilar')).veri.find((k) => k.id === per.id).site_idler, [gunes.veri.id]);
  assert.deepEqual((await p.get('/api/ben')).veri.site_idler, [gunes.veri.id]);
  assert.deepEqual((await p.get('/api/siteler')).veri.map((x) => x.ad), ['Güneş Sitesi']);
  assert.ok((await p.get('/api/daireler')).veri.every((d) => d.site === 'Güneş Sitesi'));
  assert.ok((await p.get('/api/sozlesmeler')).veri.every((d) => d.site === 'Güneş Sitesi'));
  assert.ok((await p.get('/api/borclar')).veri.every((d) => d.site === 'Güneş Sitesi'));
  assert.ok((await p.get('/api/kisiler')).veri.every((k) => k.ad_soyad !== 'Ayşe Kaya' && k.ad_soyad !== 'Mehmet Demir'));
  assert.equal((await p.get('/api/ozet')).veri.daire_toplam, 1);
  assert.equal((await p.get(`/api/daireler?site_id=${ana.id}`)).status, 403);
  assert.equal((await p.get(`/api/sozlesmeler/${sozB}`)).status, 404);
  assert.equal((await p.post('/api/tahsilatlar', { sozlesme_id: sozB, tarih: bugun(), tutar: 1 })).status, 404);
  assert.equal((await p.post('/api/tahsilatlar', { sozlesme_id: gs.veri.id, tarih: bugun(), tutar: 10000 })).status, 200);
  // Atama kaldırılınca bütün siteler yeniden görünür; yöneticiye atama yapılsa da her şeyi görür
  await y.put(`/api/kullanicilar/${per.id}`, { site_idler: [] });
  assert.equal((await p.get('/api/siteler')).veri.length, 2);
  // Aktif kiracısı olan site pasif yapılamaz; başka firmanın sitesine daire eklenemez
  assert.equal((await y.put(`/api/siteler/${gunes.veri.id}`, { ad: 'Güneş Sitesi', aktif: false })).status, 409);
  await o.firma({ firma_ad: 'Üçüncü Firma', yonetici_ad: 'Üç', eposta: 'uc@deneme.test', parola: PAROLA });
  const u = o.istemci();
  await u.giris('uc@deneme.test', PAROLA);
  assert.equal((await u.post('/api/daireler', { site_id: gunes.veri.id, daire_no: '1' })).status, 404);
  assert.equal((await u.get('/api/siteler')).veri.length, 1);
});
