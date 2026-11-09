'use strict';
// Banka ekstresi okuma: CSV (; , veya sekme ayraçlı) ve XLSX. Dış kütüphane yok.
// XLSX bir ZIP arşividir; burada yalnız gereken parçalar (paylaşılan metinler ve ilk sayfa) okunur.
// Açılmış boyut sınırlıdır (sıkıştırma bombasına karşı).
const zlib = require('node:zlib');
const { hata } = require('./dogrula');

const AZAMI_ACIK_BOYUT = 30 * 1024 * 1024;

// ---------- ZIP ----------
function zipGirdileri(buf) {
  // Merkezi dizin sonu kaydı (EOCD) dosyanın son 64 KB'ı içinde aranır.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw hata('Dosya geçerli bir XLSX değil.');
  const adet = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const girdiler = new Map();
  for (let n = 0; n < adet; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw hata('XLSX dosyası bozuk.');
    const yontem = buf.readUInt16LE(p + 10);
    const sikisik = buf.readUInt32LE(p + 20);
    const acik = buf.readUInt32LE(p + 24);
    const adUz = buf.readUInt16LE(p + 28);
    const ekUz = buf.readUInt16LE(p + 30);
    const yorumUz = buf.readUInt16LE(p + 32);
    const yerel = buf.readUInt32LE(p + 42);
    const ad = buf.toString('utf8', p + 46, p + 46 + adUz);
    girdiler.set(ad, { yontem, sikisik, acik, yerel });
    p += 46 + adUz + ekUz + yorumUz;
  }
  return girdiler;
}

function zipOku(buf, girdiler, ad) {
  const g = girdiler.get(ad);
  if (!g) return null;
  if (g.acik > AZAMI_ACIK_BOYUT) throw hata('XLSX dosyası çok büyük.');
  const p = g.yerel;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw hata('XLSX dosyası bozuk.');
  const bas = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const veri = buf.subarray(bas, bas + g.sikisik);
  if (g.yontem === 0) return veri.toString('utf8');
  if (g.yontem !== 8) throw hata('XLSX sıkıştırma biçimi desteklenmiyor.');
  return zlib.inflateRawSync(veri, { maxOutputLength: AZAMI_ACIK_BOYUT }).toString('utf8');
}

// ---------- XML yardımcıları ----------
const varlik = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => {
  const t = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()];
  if (t) return t;
  return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const metinleriBirlestir = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => varlik(m[1])).join('');

function sutunNo(ref) {
  const harf = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const c of harf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function xlsxSatirlari(buf) {
  const g = zipGirdileri(buf);
  const paylasilan = [];
  const ss = zipOku(buf, g, 'xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) paylasilan.push(metinleriBirlestir(m[1]));
  // İlk sayfanın yolu: workbook.xml → ilk <sheet r:id> → workbook.xml.rels hedefi
  let sayfaYolu = 'xl/worksheets/sheet1.xml';
  const wb = zipOku(buf, g, 'xl/workbook.xml');
  const rels = zipOku(buf, g, 'xl/_rels/workbook.xml.rels');
  const ilk = wb && wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (ilk && rels) {
    const r = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((x) => x[1]).find((x) => x.includes(`Id="${ilk[1]}"`));
    const hedef = r && r.match(/Target="([^"]+)"/);
    if (hedef) sayfaYolu = hedef[1].startsWith('/') ? hedef[1].slice(1) : 'xl/' + hedef[1].replace(/^\.\//, '');
  }
  const sayfa = zipOku(buf, g, sayfaYolu);
  if (!sayfa) throw hata('XLSX içinde sayfa bulunamadı.');
  const satirlar = [];
  for (const sm of sayfa.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const satir = [];
    for (const cm of sm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const oz = cm[1];
      const ref = (oz.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const tur = (oz.match(/\bt="([^"]+)"/) || [])[1];
      const ic = cm[2] || '';
      let deger = '';
      if (tur === 's') deger = paylasilan[Number((ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? '';
      else if (tur === 'inlineStr') deger = metinleriBirlestir(ic);
      else deger = varlik((ic.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      const kolon = ref ? sutunNo(ref) : satir.length;
      satir[kolon] = { deger, sayi: !tur || tur === 'n' };
    }
    satirlar.push(Array.from(satir, (x) => x || { deger: '', sayi: false }));
  }
  return satirlar;
}

// ---------- CSV ----------
function csvSatirlari(metin) {
  metin = metin.replace(/^﻿/, '');
  const ilkSatir = metin.split(/\r?\n/, 1)[0];
  const ayrac = [';', '\t', ','].map((a) => [a, ilkSatir.split(a).length]).sort((x, y) => y[1] - x[1])[0][0];
  const satirlar = [];
  let satir = []; let alan = ''; let tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) {
      if (c === '"' && metin[i + 1] === '"') { alan += '"'; i++; } else if (c === '"') tirnak = false; else alan += c;
    } else if (c === '"') tirnak = true;
    else if (c === ayrac) { satir.push(alan); alan = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && metin[i + 1] === '\n') i++;
      satir.push(alan); satirlar.push(satir); satir = []; alan = '';
    } else alan += c;
  }
  if (alan || satir.length) { satir.push(alan); satirlar.push(satir); }
  return satirlar.map((s) => s.map((deger) => ({ deger: deger.trim(), sayi: false })));
}

// ---------- Sütun bulma ve değer çevirme ----------
const normal = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]).replace(/[^a-z0-9]+/g, ' ').trim();

const BASLIKLAR = {
  tarih: ['tarih', 'islem tarihi', 'valor', 'date', 'islem zamani'],
  aciklama: ['aciklama', 'islem aciklamasi', 'description', 'detay', 'aciklama detay'],
  tutar: ['tutar', 'amount', 'islem tutari', 'miktar'],
  alacak: ['alacak', 'giren', 'gelen', 'yatan'],
  borc: ['borc', 'cikan', 'giden'],
  gonderen: ['gonderen', 'gonderen ad', 'unvan', 'ad soyad', 'karsi taraf', 'sender', 'muhatap'],
  iban: ['iban', 'gonderen iban', 'karsi iban', 'hesap no'],
};

function sutunlariBul(satirlar) {
  for (let i = 0; i < Math.min(satirlar.length, 30); i++) {
    const adlar = satirlar[i].map((h) => normal(h.deger));
    const bul = (anahtar) => {
      for (const a of BASLIKLAR[anahtar]) { const j = adlar.indexOf(a); if (j >= 0) return j; }
      for (const a of BASLIKLAR[anahtar]) { const j = adlar.findIndex((x) => x && x.startsWith(a)); if (j >= 0) return j; }
      return -1;
    };
    const s = { tarih: bul('tarih'), aciklama: bul('aciklama'), tutar: bul('tutar'), alacak: bul('alacak'), borc: bul('borc'), gonderen: bul('gonderen'), iban: bul('iban') };
    if (s.tarih >= 0 && s.aciklama >= 0 && (s.tutar >= 0 || s.alacak >= 0)) return { baslikSatiri: i, sutun: s };
  }
  throw hata('Ekstrede Tarih, Açıklama ve Tutar (ya da Alacak) sütunları bulunamadı. Başlık satırını kontrol edin.');
}

// "1.234,56" / "1,234.56" / "-500" / Excel sayısı → sayı
function paraCevir(h) {
  if (!h || h.deger === '') return null;
  if (h.sayi) { const n = Number(h.deger); return Number.isFinite(n) ? n : null; }
  let s = h.deger.replace(/[^\d,.\-+]/g, '');
  if (!s) return null;
  const virgul = s.lastIndexOf(','); const nokta = s.lastIndexOf('.');
  if (virgul > nokta) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tarihCevir(h) {
  if (!h || h.deger === '') return null;
  if (h.sayi && /^\d+(\.\d+)?$/.test(h.deger)) {
    // Excel seri günü (1900 sistemi; 25569 = 1970-01-01)
    const d = new Date(Math.round((Number(h.deger) - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = h.deger.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Dosyayı okuyup gelen (artı tutarlı) hareketleri döndürür. Giden (eksi) hareketler kira değildir, atlanır.
function ekstreOku(buf, dosyaAdi) {
  const xlsx = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (!xlsx && buf.length > 8 && buf.readUInt32LE(0) === 0xe011cfd0) {
    throw hata('Eski .xls biçimi desteklenmiyor. Dosyayı Excel\'de "Farklı kaydet → .xlsx" ya da CSV olarak kaydedip yükleyin.');
  }
  const satirlar = xlsx ? xlsxSatirlari(buf) : csvSatirlari(buf.toString('utf8'));
  const { baslikSatiri, sutun } = sutunlariBul(satirlar);
  const hareketler = [];
  let atlanan = 0;
  for (const s of satirlar.slice(baslikSatiri + 1)) {
    if (!s.some((h) => h.deger !== '')) continue;
    const tarih = tarihCevir(s[sutun.tarih]);
    let tutar = sutun.tutar >= 0 ? paraCevir(s[sutun.tutar]) : null;
    if (tutar === null && sutun.alacak >= 0) tutar = paraCevir(s[sutun.alacak]);
    if (tutar === null && sutun.borc >= 0 && paraCevir(s[sutun.borc])) tutar = -Math.abs(paraCevir(s[sutun.borc]));
    const aciklama = (s[sutun.aciklama]?.deger || '').slice(0, 1000);
    if (!tarih || tutar === null || !(tutar > 0)) { atlanan++; continue; }
    hareketler.push({
      tarih,
      tutar: Math.round(tutar * 100) / 100,
      aciklama,
      gonderen: sutun.gonderen >= 0 ? (s[sutun.gonderen]?.deger || '').slice(0, 200) || null : null,
      iban: sutun.iban >= 0 ? ibanNormal(s[sutun.iban]?.deger || '') || null : null,
      dosya: String(dosyaAdi || '').slice(0, 200) || null,
    });
  }
  return { hareketler, atlanan };
}

const ibanNormal = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = { ekstreOku, normal, ibanNormal, paraCevir, tarihCevir, csvSatirlari, xlsxSatirlari };
