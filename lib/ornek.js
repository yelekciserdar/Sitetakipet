'use strict';
// Deneme hesabına isteğe bağlı örnek veri: tek site, 8 daire, sabit aidat, son üç ayın aidatları, birkaç ödeme ve gider.
// Kullanıcı programı boş ekranla değil, dolu bir siteyle görsün diye. Hepsi "Örnek" adlı; istenirse silinebilir/değiştirilebilir.
const kr = require('./kira');
const ai = require('./aidat');

const MALIKLER = ['Ahmet Yılmaz', 'Elif Demir', 'Mehmet Kaya', 'Zeynep Çelik', 'Mustafa Şahin', 'Ayşe Arslan', 'Hasan Doğan', 'Fatma Koç'];

function ay(n) { const [a, b] = ai.buAy().split('-').map(Number); return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7); }
function gun(donem, g) { const son = new Date(Date.UTC(+donem.slice(0, 4), +donem.slice(5, 7), 0)).getUTCDate(); return `${donem}-${String(Math.min(g, son)).padStart(2, '0')}`; }

async function ornekVeriYukle(c, ctx, siteId) {
  await c.query(`UPDATE siteler SET ad = 'Örnek Sitesi', adres = 'Örnek Mah. Deneme Sok. No 1' WHERE id = $1 AND firma_id = $2`, [siteId, ctx.firma_id]);
  const daireler = [];
  for (let i = 1; i <= 8; i++) {
    const d = await kr.daireEkle(c, ctx, { site_id: siteId, blok: 'A', daire_no: String(i), kat: String(Math.ceil(i / 2)), oda: i % 2 ? '3+1' : '2+1', metrekare: i % 2 ? 120 : 95,
      ev_sahibi: { ad_soyad: MALIKLER[i - 1], telefon: `0500 000 00 ${String(10 + i)}` }, ev_sahibi_oturuyor: true });
    daireler.push(d.id);
  }
  await ai.aidatPlaniKaydet(c, ctx, siteId, { aidat_yontemi: 'Sabit', aidat_tutari: 1500, aidat_gunu: 10, aidat_baslangic: ay(-2), gecikme_orani: 5 });
  for (let n = -2; n <= 0; n++) await ai.tahakkuk(c, ctx, { donem: ay(n), sessiz: true });
  const bugun = ai.bugun();
  for (const [i, id] of daireler.entries()) {
    for (let n = -2; n <= 0; n++) {
      if ((i === 2 && n >= -1) || (i === 5 && n === 0)) continue; // biri iki aydır, biri bu ay ödememiş
      const tarih = gun(ay(n), 5 + i);
      if (tarih <= bugun) await ai.tahsilatEkle(c, ctx, { daire_id: id, tarih, tutar: 1500, odeme_turu: i % 3 ? 'Havale/EFT' : 'Nakit', odeyen: MALIKLER[i] });
    }
  }
  for (let n = -2; n <= 0; n++) {
    for (const [kat, tutar, g] of [['Elektrik', 1800, 4], ['Temizlik', 4500, 7], ['Asansör', 1200, 12]]) {
      const tarih = gun(ay(n), g);
      if (tarih <= bugun) await ai.giderEkle(c, ctx, { site_id: siteId, tarih, kategori: kat, tutar, aciklama: 'Örnek gider' });
    }
  }
}

module.exports = { ornekVeriYukle };
