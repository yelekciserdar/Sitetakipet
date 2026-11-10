'use strict';
// Tanıtım/önizleme için sahte verili deneme firması açar (gerçek müşteri verisi DEĞİL).
// Kullanım: DEMO_PAROLASI=... DATABASE_URL=... node scripts/demo-veri.js
const { havuzOlustur, islem } = require('../lib/db');
const { gocleriUygula } = require('./migrate');
const ck = require('../lib/cekirdek');
const kr = require('../lib/kira');
const bk = require('../lib/banka');
const st = require('../lib/site');

const SAHIPLER = ['Kemal Ateş', 'Sevgi Yurt', 'Orhan Bal', 'Leyla Gök', 'Murat Can', 'Hülya Deniz'];
const LALE = ['Tuğba Er', 'Cem Kara', 'Nur Şen', 'Ozan Tan', 'Ebru Ak', 'Sinan Işık'];
const ADLAR = ['Mehmet Demir', 'Ayşe Kaya', 'Ali Yıldız', 'Fatma Şahin', 'Mustafa Çelik', 'Zeynep Arslan', 'Emre Koç', 'Elif Aydın',
  'Burak Öztürk', 'Selin Kurt', 'Hasan Polat', 'Merve Doğan', 'Can Aksoy', 'Derya Erdem', 'Onur Güneş', 'Gizem Tekin', 'Kaan Uçar', 'Buse Yalçın', 'Serkan Avcı', 'İrem Bulut'];

function rastgele(tohum) { let x = tohum; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
function ay(n) { const [a, b] = kr.buAy().split('-').map(Number); return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7); }
function gun(donem, g) { const son = new Date(Date.UTC(+donem.slice(0, 4), +donem.slice(5, 7), 0)).getUTCDate(); return `${donem}-${String(Math.min(g, son)).padStart(2, '0')}`; }

(async () => {
  const pool = havuzOlustur();
  try {
    await gocleriUygula(pool);
    const parola = process.env.DEMO_PAROLASI;
    if (!parola) throw new Error('DEMO_PAROLASI ortam değişkeni gerekli.');
    await islem(pool, async (c) => {
      const f = await ck.firmaOlustur(c, { firma_ad: 'Deneme Gayrimenkul', yonetici_ad: 'Deneme Yönetici', eposta: 'demo@deneme.test', parola, site_ad: 'Güneş Sitesi' });
      const ctx = { firma_id: f.firma_id, kullanici_id: f.kullanici_id, rol: 'yonetici' };
      const r = rastgele(7);
      const daireler = [];
      for (const blok of ['A', 'B']) {
        for (let i = 1; i <= 12; i++) {
          const sahibiOturuyor = blok === 'B' && i >= 11;
          const sahip = i % 3 === 0 || sahibiOturuyor ? { ad_soyad: SAHIPLER[(i + (blok === 'B' ? 3 : 0)) % SAHIPLER.length], telefon: `0533 000 00 ${String(10 + i)}` } : undefined;
          const d = await kr.daireEkle(c, ctx, { site_id: f.site_id, blok, daire_no: String(i), kat: String(Math.ceil(i / 4)), oda: ['2+1', '3+1', '1+1'][i % 3], metrekare: [95, 120, 65][i % 3], tip: i === 1 ? 'İşyeri' : 'Konut',
            ev_sahibi: sahip, ev_sahibi_oturuyor: sahibiOturuyor });
          daireler.push(d.id);
        }
      }
      const bugun = kr.bugun();
      for (let i = 0; i < ADLAR.length; i++) {
        const baslangicAy = -Math.floor(2 + r() * 9);
        const kira = Math.round((14 + r() * 22)) * 1000;
        const odemeGunu = [1, 5, 10, 15][i % 4];
        const s = await kr.sozlesmeEkle(c, ctx, {
          daire_id: daireler[i + (i >= 10 ? 2 : 0)], baslangic: gun(ay(baslangicAy), 1), aylik_kira: kira, depozito: kira, odeme_gunu: odemeGunu,
          kisi: { ad_soyad: ADLAR[i], telefon: `0555 000 00 ${String(10 + i)}`, odeme_kodu: `${i < 10 ? 'A' : 'B'}${(i % 10) + 1}K`,
            iban: `TR${String(10 + i).padStart(2, '0')}${'0'.repeat(20)}${String(i).padStart(2, '0')}` },
        });
        for (let n = baslangicAy; n < 0; n++) await kr.tahakkuk(c, ctx, { donem: ay(n), sozlesme_id: s.id, sessiz: true });
        // Ödeme davranışı: çoğu düzenli, birkaçı geç/eksik, ikisi bu ay ve geçen ay ödememiş
        const tip = i % 7 === 3 ? 'geciken' : i % 5 === 2 ? 'eksik' : 'duzenli';
        for (let n = baslangicAy; n <= 0; n++) {
          const donem = ay(n);
          const tarih = gun(donem, odemeGunu + Math.floor(r() * 3));
          if (tarih > bugun) continue;
          if (tip === 'geciken' && n >= -1) continue;
          const tutar = tip === 'eksik' && n === -1 ? Math.round(kira / 2) : kira;
          await kr.tahsilatEkle(c, ctx, { sozlesme_id: s.id, tarih, tutar, odeme_turu: r() < 0.7 ? 'Havale/EFT' : 'Nakit' });
        }
      }
      // İkinci site: Lale Apartmanı (blok yok, 8 daire, 6 kiracı)
      const lale = await st.siteEkle(c, ctx, { ad: 'Lale Apartmanı', adres: 'Deneme Mah. Lale Sok. No 5' });
      for (let i = 1; i <= 8; i++) {
        const d = await kr.daireEkle(c, ctx, { site_id: lale.id, daire_no: String(i), kat: String(Math.ceil(i / 2)), oda: '2+1', metrekare: 90,
          ev_sahibi: i === 7 ? { ad_soyad: 'Gülay Şimşek', telefon: '0533 000 00 77' } : undefined, ev_sahibi_oturuyor: i === 7 });
        if (i > LALE.length) continue;
        const kira = 12000 + i * 1000;
        const so = await kr.sozlesmeEkle(c, ctx, { daire_id: d.id, baslangic: gun(ay(-3), 1), aylik_kira: kira, odeme_gunu: 5,
          kisi: { ad_soyad: LALE[i - 1], telefon: `0532 000 00 ${String(10 + i)}`, odeme_kodu: `L${i}K` } });
        for (let n = -3; n < 0; n++) await kr.tahakkuk(c, ctx, { donem: ay(n), sozlesme_id: so.id, sessiz: true });
        for (let n = -3; n <= (i === 4 ? -2 : 0); n++) {
          const tarih = gun(ay(n), 5 + (i % 3));
          if (tarih <= bugun) await kr.tahsilatEkle(c, ctx, { sozlesme_id: so.id, tarih, tutar: kira, odeme_turu: 'Havale/EFT' });
        }
      }
      // Örnek banka ekstresi: biri kodla otomatik eşleşir, biri kontrol ister, biri kira değildir
      const tr = (t) => t.split('-').reverse().join('.');
      const csv = ['Tarih;Açıklama;Tutar;Gönderen;IBAN',
        `${tr(bugun)};KIRA B3K KASIM;${'15000,00'};HASAN POLAT;`,
        `${tr(bugun)};HAVALE KIRA;${'18000,00'};D. ERDEM;`,
        `${tr(bugun)};AIDAT IADESI;${'1250,00'};SITE YONETIMI;`].join('\n');
      await bk.ekstreYukle(c, ctx, { dosya_adi: 'ornek-ekstre.csv', icerik_base64: Buffer.from(csv).toString('base64') });
      await ck.kullaniciEkle(c, ctx, { ad_soyad: 'Deneme Personel', eposta: 'personel@deneme.test', parola, rol: 'personel', site_idler: [lale.id] });
      console.log('Deneme firması açıldı. Giriş: demo@deneme.test');
    });
  } catch (e) {
    console.error('Demo verisi oluşturulamadı:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
