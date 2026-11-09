'use strict';
// Girdi doğrulama: kullanıcıdan gelen her değer burada denetlenir; hatalı girdi 400 döner, sunucu hatası olmaz.

class HttpHata extends Error {
  constructor(status, mesaj) {
    super(mesaj);
    this.status = status;
  }
}

const hata = (mesaj, status = 400) => new HttpHata(status, mesaj);

function metin(v, ad, { zorunlu = false, max = 200 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (zorunlu) throw hata(`${ad} boş bırakılamaz.`);
    return null;
  }
  if (typeof v !== 'string') throw hata(`${ad} metin olmalı.`);
  const s = v.trim();
  if (!s && zorunlu) throw hata(`${ad} boş bırakılamaz.`);
  if (s.length > max) throw hata(`${ad} en fazla ${max} karakter olabilir.`);
  return s || null;
}

const TUTAR_UST = 100_000_000_000; // 100 milyar TL

function tutar(v, ad, { zorunlu = true, pozitif = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (zorunlu) throw hata(`${ad} girilmeli.`);
    return 0;
  }
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw hata(`${ad} geçerli bir tutar olmalı.`);
  if (n < 0) throw hata(`${ad} eksi olamaz.`);
  if (pozitif && n <= 0) throw hata(`${ad} sıfırdan büyük olmalı.`);
  if (n > TUTAR_UST) throw hata(`${ad} çok büyük.`);
  return Math.round(n * 100) / 100;
}

function tarih(v, ad, { zorunlu = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (zorunlu) throw hata(`${ad} girilmeli.`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw hata(`${ad} YYYY-AA-GG biçiminde olmalı.`);
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw hata(`${ad} geçerli bir tarih değil.`);
  const yil = d.getUTCFullYear();
  if (yil < 2000 || yil > 2100) throw hata(`${ad} 2000–2100 arasında olmalı.`);
  return v;
}

function saat(v, ad) {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw hata(`${ad} SS:DD biçiminde olmalı (ör. 19:00).`);
  return v;
}

function donem(v, ad = 'Dönem') {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw hata(`${ad} YYYY-AA biçiminde olmalı.`);
  return v;
}

function kimlik(v, ad, { zorunlu = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (zorunlu) throw hata(`${ad} seçilmeli.`);
    return null;
  }
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (!Number.isSafeInteger(n) || n <= 0) throw hata(`${ad} geçersiz.`);
  return n;
}

function secim(v, ad, liste, { varsayilan } = {}) {
  if ((v === undefined || v === null || v === '') && varsayilan !== undefined) return varsayilan;
  if (!liste.includes(v)) throw hata(`${ad} şunlardan biri olmalı: ${liste.join(', ')}.`);
  return v;
}

function mantiksal(v, { varsayilan = false } = {}) {
  if (v === undefined || v === null) return varsayilan;
  if (typeof v !== 'boolean') throw hata('Evet/hayır alanı geçersiz.');
  return v;
}

function yil(v) {
  const n = typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : v;
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw hata('Yıl 2000–2100 arasında olmalı.');
  return n;
}

const ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer'];

module.exports = { HttpHata, hata, metin, tutar, tarih, saat, donem, kimlik, secim, mantiksal, yil, ODEME_TURLERI };
