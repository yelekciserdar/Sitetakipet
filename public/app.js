'use strict';
// SiteTakipEt arayüzü: dış kütüphane yok. Kullanıcı verisi yalnız textContent ile yazılır (innerHTML yok).

// ---------- Yardımcılar ----------
const $ = (s, el = document) => el.querySelector(s);
function h(etiket, ozellik, ...cocuklar) {
  const el = document.createElement(etiket);
  if (ozellik) {
    for (const [k, v] of Object.entries(ozellik)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of cocuklar.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const SVG = 'http://www.w3.org/2000/svg';
function s(etiket, ozellik = {}, ...cocuklar) {
  const el = document.createElementNS(SVG, etiket);
  for (const [k, v] of Object.entries(ozellik)) el.setAttribute(k, v);
  for (const c of cocuklar) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const paraBicim = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const para = (n) => paraBicim.format(Number(n) || 0) + ' ₺';
const kisaPara = (n) => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n) + ' ₺';
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer'];
function tarihTR(t) { if (!t) return ''; const [y, a, g] = t.slice(0, 10).split('-'); return `${g}.${a}.${y}`; }
function donemTR(d) { if (!d) return ''; const [y, a] = d.split('-'); return `${AYLAR[Number(a) - 1]} ${y}`; }
function bugun() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const buAy = () => bugun().slice(0, 7);
function ayKaydir(d, n) { const [y, a] = d.split('-').map(Number); const t = new Date(y, a - 1 + n, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; }
const daireAdi = (x) => (x.blok ? `${x.blok} Blok ${x.daire_no}` : x.daire_no);

function bildir(mesaj, hata = false) {
  const t = h('div', { class: 'toast' + (hata ? ' hata' : '') }, mesaj);
  $('#bildirim').append(t);
  setTimeout(() => t.remove(), hata ? 6000 : 3500);
}

async function api(yontem, yol, govde) {
  const r = await fetch(yol, {
    method: yontem,
    headers: govde !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: govde !== undefined ? JSON.stringify(govde) : undefined,
    credentials: 'same-origin',
  });
  let veri = null;
  try { veri = await r.json(); } catch { /* boş */ }
  if (r.status === 401 && yol !== '/api/giris') { durum.ben = null; girisEkrani(); throw new Error('Oturum kapandı, yeniden giriş yapın.'); }
  if (r.status === 402 && veri?.deneme_bitti) { denemeBittiEkrani(); throw new Error(veri.hata); }
  if (!r.ok) throw new Error(veri?.hata || 'İşlem yapılamadı.');
  return veri;
}

function formVerisi(form) {
  const v = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') v[el.name] = el.checked;
    else if (el.dataset.tur === 'sayi') v[el.name] = el.value === '' ? undefined : Number(el.value.replace(/\./g, '').replace(',', '.'));
    else v[el.name] = el.value === '' ? undefined : el.value;
  }
  return v;
}
const alan = (etiket, girdi, tam = false) => h('label', { class: 'alan' + (tam ? ' tam' : '') }, etiket, girdi);
const metinGirdi = (ad, o = {}) => h('input', { name: ad, type: 'text', autocomplete: 'off', ...o });
const tutarGirdi = (ad, o = {}) => h('input', { name: ad, type: 'text', inputmode: 'decimal', 'data-tur': 'sayi', placeholder: '0,00', ...o, value: o.value === undefined || o.value === null ? undefined : String(o.value).replace('.', ',') });
const tarihGirdi = (ad, o = {}) => h('input', { name: ad, type: 'date', ...o });
function secimGirdi(ad, secenekler, secili, o = {}) {
  return h('select', { name: ad, ...o }, secenekler.map((x) => {
    const [deger, yazi] = Array.isArray(x) ? x : [x, x];
    return h('option', { value: deger, selected: String(deger) === String(secili) }, yazi);
  }));
}

function pencere(baslik, govde, dugmeler = [], { genis = false } = {}) {
  const kapat = () => perde.remove();
  const perde = h('div', { class: 'perde', onclick: (e) => { if (e.target === perde) kapat(); } },
    h('div', { class: 'pencere', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'pencere-ust' }, h('h2', null, baslik), h('button', { 'aria-label': 'Kapat', onclick: kapat }, '×')),
      h('div', { class: 'pencere-govde' }, govde),
      dugmeler.length ? h('div', { class: 'pencere-alt' }, dugmeler) : null));
  if (genis) perde.firstChild.style.maxWidth = '860px';
  document.body.append(perde);
  const ilk = perde.querySelector('input:not([type=file]), select, textarea');
  if (ilk) setTimeout(() => ilk.focus(), 30);
  return kapat;
}
async function gonder(dugme, hataEl, is) {
  dugme.disabled = true; hataEl.textContent = '';
  try { return await is(); } catch (e) { hataEl.textContent = e.message; return undefined; } finally { dugme.disabled = false; }
}
function tablo(basliklar, satirlar, bosMesaj = 'Kayıt yok.') {
  if (!satirlar.length) return h('div', { class: 'bos-liste' }, bosMesaj);
  return h('div', { class: 'tablo-kap' }, h('table', null,
    h('thead', null, h('tr', null, basliklar.map((b) => { const [y, c] = Array.isArray(b) ? b : [b]; return h('th', { class: c }, y); }))),
    h('tbody', null, satirlar)));
}
const ROZET = { 'Ödendi': 'yesil', 'Gecikti': 'turuncu', 'Kısmi Ödendi': 'mavi', 'Bekliyor': '', 'Boş': '', 'Kiracılı': 'mavi', 'Ev sahibi': 'koyu', 'Pasif': 'kirmizi', 'Aktif': 'mavi', 'Ayrıldı': '',
  'Otomatik Eşleşti': 'yesil', 'Elle Eşleşti': 'yesil', 'Kontrol Gerekli': 'turuncu', 'Eşleşmedi': 'kirmizi', 'Yok Sayıldı': '' };
const rozet = (d) => h('span', { class: 'rozet ' + (ROZET[d] ?? '') }, d);
function basitForm(baslik, alanlar, isle, { dugmeYazi = 'Kaydet', genis = false } = {}) {
  const hataEl = h('div', { class: 'hata-yazi' });
  const dugme = h('button', { class: 'dugme', type: 'submit', form: 'basit-form' }, dugmeYazi);
  const form = h('form', { id: 'basit-form', onsubmit: (e) => { e.preventDefault(); gonder(dugme, hataEl, async () => { const r = await isle(formVerisi(form)); kapat(); if (r !== false) yenile(); }); } },
    h('div', { class: 'form' }, alanlar, h('div', { class: 'tam' }, hataEl)));
  const kapat = pencere(baslik, form, [h('button', { class: 'dugme ikincil', type: 'button', onclick: () => kapat() }, 'Vazgeç'), dugme], { genis });
  return kapat;
}

// ---------- Durum ----------
const durum = { ben: null, ayarlar: null, yil: new Date().getFullYear(), siteler: [], siteId: null };
const cokSite = () => durum.siteler.length > 1;
// Seçili site varsa API isteğine eklenecek süzgeç (ör. "&site_id=3")
const siteP = (ilk = '&') => (durum.siteId ? `${ilk}site_id=${durum.siteId}` : '');
// "Tüm siteler" görünümünde daire adının önüne site adı eklenir
const adi = (x) => (cokSite() && !durum.siteId && x.site ? `${x.site} · ${daireAdi(x)}` : daireAdi(x));
function siteSec(id) {
  durum.siteId = id ? Number(id) : null;
  try { localStorage.setItem('kt_site', durum.siteId ? String(durum.siteId) : ''); } catch { /* özel pencere */ }
  yenile();
}
async function siteleriYukle() {
  durum.siteler = await api('GET', '/api/siteler').catch(() => []);
  let kayitli = null;
  try { kayitli = Number(localStorage.getItem('kt_site')) || null; } catch { /* yok */ }
  durum.siteId = durum.siteler.some((x) => x.id === kayitli && x.aktif) ? kayitli : null;
}
const yonetici = () => durum.ben?.rol === 'yonetici';

// ---------- Giriş ----------
function logo() {
  return h('div', { class: 'logo' }, h('img', { class: 'isaret', src: '/logo-isaret.svg', alt: '' }),
    h('span', { class: 'yazi' }, h('span', { class: 'y-ad' }, 'Site'), h('span', { class: 'y-takip' }, 'TakipEt')));
}

function girisEkrani() {
  const hataEl = h('div', { class: 'hata-yazi' });
  const dugme = h('button', { class: 'dugme', type: 'submit' }, 'Giriş yap');
  dugme.style.width = '100%';
  const form = h('form', { onsubmit: (e) => { e.preventDefault(); gonder(dugme, hataEl, async () => { await api('POST', '/api/giris', formVerisi(form)); await basla(); }); } },
    h('div', { class: 'form' },
      alan('E-posta', h('input', { name: 'eposta', type: 'email', autocomplete: 'username', required: true }), true),
      alan('Parola', h('input', { name: 'parola', type: 'password', autocomplete: 'current-password', required: true }), true),
      h('div', { class: 'tam' }, hataEl, dugme)));
  $('#uygulama').replaceChildren(h('div', { class: 'giris-sayfa' },
    h('div', { class: 'giris-sol' }, logo(),
      h('div', null,
        h('h2', null, 'Siteler, daireler ve tahsilatlar tek ekranda.'),
        h('p', null, 'Her ayın borcu kendiliğinden oluşur, banka ekstresindeki ödemeler dairelerle eşleşir, geciken ödemeyi ilk gün görürsünüz.')),
      h('div', { class: 'serit' }, h('span'), h('span'), h('span'))),
    h('div', { class: 'giris-sag' }, h('div', { class: 'giris-kutu' }, h('h1', null, 'Hoş geldiniz'), h('p', { class: 'soluk' }, 'Hesabınızla giriş yapın.'), form,
      h('p', { class: 'giris-alt' }, 'Hesabınız yok mu? ', h('a', { href: '#/kayit', onclick: (e) => { e.preventDefault(); location.hash = '#/kayit'; kayitEkrani(); } }, '14 gün ücretsiz deneyin'))))));
}

// Kendi kendine deneme kaydı: formu doldurunca hesap açılır ve program hemen açılır.
function kayitEkrani() {
  const hataEl = h('div', { class: 'hata-yazi' });
  const dugme = h('button', { class: 'dugme', type: 'submit' }, 'Deneme hesabımı aç');
  dugme.style.width = '100%';
  const form = h('form', { onsubmit: (e) => { e.preventDefault(); gonder(dugme, hataEl, async () => {
    const v = formVerisi(form);
    if (v.parola !== v.parola2) throw new Error('Parolalar aynı değil.');
    delete v.parola2;
    await api('POST', '/api/kayit', v);
    location.hash = '#/panel';
    await basla();
    bildir('Deneme hesabınız açıldı. İyi çalışmalar!');
  }); } },
    h('div', { class: 'form' },
      alan('Firma adı', metinGirdi('firma_ad', { required: true, maxlength: 200, placeholder: 'ör. Deneme Yönetim Hizmetleri', autocomplete: 'organization' }), true),
      alan('Adınız soyadınız', metinGirdi('ad_soyad', { required: true, maxlength: 120, autocomplete: 'name' }), true),
      alan('E-posta', h('input', { name: 'eposta', type: 'email', required: true, autocomplete: 'email' })),
      alan('Telefon', h('input', { name: 'telefon', type: 'tel', required: true, inputmode: 'tel', autocomplete: 'tel', placeholder: '05xx xxx xx xx' })),
      alan('Parola (en az 10 karakter)', h('input', { name: 'parola', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
      alan('Parola (tekrar)', h('input', { name: 'parola2', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
      h('input', { name: 'web_sitesi', type: 'text', tabindex: '-1', autocomplete: 'off', class: 'tuzak', 'aria-hidden': 'true' }),
      h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'ornek', checked: true }), 'Örnek bir siteyle başla (8 daire, aidatlar ve giderler; sonra silebilir ya da değiştirebilirsiniz)'),
      h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'kvkk', required: true }),
        h('span', null, h('a', { href: 'https://sitetakipet.com.tr/gizlilik.html', target: '_blank', rel: 'noopener' }, 'Aydınlatma metnini'), ' okudum; deneme hesabının açılması için bilgilerimin işlenmesini kabul ediyorum.')),
      h('div', { class: 'tam' }, hataEl, dugme)));
  $('#uygulama').replaceChildren(h('div', { class: 'giris-sayfa' },
    h('div', { class: 'giris-sol' }, logo(),
      h('div', null,
        h('h2', null, '14 gün ücretsiz deneyin.'),
        h('p', null, 'Kart bilgisi istemiyoruz, kurulum yok. Hesabınız hemen açılır; aidat planını girin, ödemeleri alın, makbuz kesin, borçluları görün. Süre bitince verileriniz silinmez, satın aldığınızda kaldığınız yerden devam edersiniz.')),
      h('div', { class: 'serit' }, h('span'), h('span'), h('span'))),
    h('div', { class: 'giris-sag' }, h('div', { class: 'giris-kutu genis' }, h('h1', null, 'Deneme hesabı'), h('p', { class: 'soluk' }, 'Bilgilerinizi girin, programa hemen geçin.'), form,
      h('p', { class: 'giris-alt' }, 'Hesabınız var mı? ', h('a', { href: '#/', onclick: (e) => { e.preventDefault(); location.hash = ''; girisEkrani(); } }, 'Giriş yapın'))))));
}

function satisBaglantisi(yazi) {
  const tel = (durum.ben?.satis_telefon || '').replace(/\D/g, '').replace(/^0/, '90');
  if (tel.length >= 11) return h('a', { class: 'dugme', href: `https://wa.me/${tel}?text=${encodeURIComponent(`Merhaba, SiteTakipEt'i satın almak istiyorum. Firma: ${durum.ben?.firma_ad || ''}`)}`, target: '_blank', rel: 'noopener' }, yazi);
  return h('a', { class: 'dugme', href: 'https://sitetakipet.com.tr/#son', target: '_blank', rel: 'noopener' }, yazi);
}
function denemeBittiEkrani() {
  $('#uygulama').replaceChildren(h('div', { class: 'giris-sayfa' },
    h('div', { class: 'giris-sol' }, logo(), h('div', null, h('h2', null, 'Deneme süreniz doldu.'),
      h('p', null, 'Girdiğiniz bütün site, daire, aidat ve ödeme kayıtları saklanıyor. Satın aldığınızda kaldığınız yerden devam edersiniz.')), h('div', { class: 'serit' }, h('span'), h('span'), h('span'))),
    h('div', { class: 'giris-sag' }, h('div', { class: 'giris-kutu' }, h('h1', null, durum.ben?.firma_ad || 'SiteTakipEt'),
      h('p', { class: 'soluk' }, 'Programı kullanmaya devam etmek için bize yazın.'), satisBaglantisi('Satın almak için yazın'),
      h('p', { class: 'giris-alt' }, h('a', { href: '#/', onclick: (e) => { e.preventDefault(); cikis(); } }, 'Çıkış yap'))))));
}
function denemeSeridi() {
  if (!durum.ben?.deneme_bitis) return null;
  const kalan = Math.max(0, Math.ceil((new Date(durum.ben.deneme_bitis) - Date.now()) / 86400000));
  return h('div', { class: 'deneme-serit' }, h('span', null, h('b', null, 'Deneme sürümü'), ` · ${kalan} gün kaldı. Verileriniz süre bitince de saklanır.`), satisBaglantisi('Satın al'));
}

// ---------- Yerleşim ----------
const SAYFALAR = [
  { yol: 'panel', ad: 'Panel', simge: '▦', ciz: (i) => aidatPanelSayfasi(i) },
  { yol: 'daireler', ad: 'Daireler', simge: '⌂', ciz: (i) => dairelerSayfasi(i) },
  { yol: 'aidat', ad: 'Aidat Takibi', simge: '₺', ciz: (i) => aidatTakibiSayfasi(i) },
  { yol: 'borclular', ad: 'Borçlular', simge: '!', ciz: (i) => borclularSayfasi(i) },
  { yol: 'giderler', ad: 'Giderler', simge: '−', ciz: (i) => giderlerSayfasi(i) },
  { yol: 'gelir-gider', ad: 'Gelir-Gider', simge: '▤', ciz: (i) => gelirGiderSayfasi(i), yonetici: true },
  { yol: 'aidat-plani', ad: 'Aidat Planı', simge: '%', ciz: (i) => aidatPlaniSayfasi(i), yonetici: true },
  { yol: 'kiracilar', ad: 'Kiracılar', simge: '☺', ciz: kiracilarSayfasi, kira: true },
  { yol: 'kira-takibi', ad: 'Kira Takibi', simge: '₺', ciz: kiraTakibiSayfasi, kira: true },
  { yol: 'gecikenler', ad: 'Geciken Kiralar', simge: '!', ciz: gecikenlerSayfasi, kira: true },
  { yol: 'banka', ad: 'Banka Ekstresi', simge: '⇅', ciz: bankaSayfasi, yonetici: true, kira: true },
  { yol: 'raporlar', ad: 'Kira Raporu', simge: '▤', ciz: raporlarSayfasi, yonetici: true, kira: true },
  { yol: 'ayarlar', ad: 'Ayarlar', simge: '⚙', ciz: ayarlarSayfasi, yonetici: true },
];
const sayfaGorunur = (p) => (!p.yonetici || yonetici()) && (!p.kira || kiraAcik());

function yerlesim() {
  const aktifSiteler = durum.siteler.filter((x) => x.aktif);
  const siteSecici = aktifSiteler.length > 1 ? h('label', { class: 'site-secici' }, h('span', null, 'Site'),
    h('select', { onchange: (e) => siteSec(e.target.value) },
      h('option', { value: '' }, 'Tüm siteler'),
      aktifSiteler.map((x) => h('option', { value: x.id, selected: x.id === durum.siteId }, x.ad)))) : null;
  const kenar = h('aside', { class: 'kenar' }, logo(), siteSecici,
    h('nav', null, SAYFALAR.filter(sayfaGorunur).flatMap((p, i, l) => [
      p.kira && !l[i - 1]?.kira ? h('div', { class: 'nav-grup' }, 'Kira bölümü') : null,
      !p.kira && l[i - 1]?.kira ? h('div', { class: 'nav-grup' }) : null,
      h('a', { href: '#/' + p.yol, 'data-yol': p.yol, onclick: () => kenar.classList.remove('acik') }, h('span', { class: 'simge' }, p.simge), p.ad)])),
    h('div', { class: 'alt' }, h('b', null, durum.ben.firma_ad), h('span', null, `${durum.ben.ad_soyad} · ${yonetici() ? 'Yönetici' : 'Personel'}`), h('br'),
      h('button', { onclick: cikis }, 'Çıkış yap')));
  $('#uygulama').replaceChildren(
    h('div', { class: 'mobil-ust' }, logo(), h('button', { 'aria-label': 'Menü', onclick: () => kenar.classList.toggle('acik') }, '☰')),
    h('div', { class: 'yerlesim' }, kenar, h('div', { class: 'icerik-kap' }, denemeSeridi(), h('main', { class: 'icerik', id: 'icerik' }))));
}
async function cikis() { await api('POST', '/api/cikis', {}).catch(() => {}); durum.ben = null; location.hash = ''; girisEkrani(); }

async function yonlendir() {
  if (!durum.ben) return;
  const yol = (location.hash.replace(/^#\//, '') || 'panel').split('?')[0];
  const sayfa = SAYFALAR.find((p) => p.yol === yol && sayfaGorunur(p)) || SAYFALAR[0];
  document.querySelectorAll('.kenar nav a').forEach((a) => a.classList.toggle('aktif', a.dataset.yol === sayfa.yol));
  const icerik = $('#icerik');
  icerik.replaceChildren(h('p', { class: 'yukleniyor' }, 'Yükleniyor…'));
  try { await sayfa.ciz(icerik); } catch (e) { icerik.replaceChildren(h('div', { class: 'kart' }, h('p', { class: 'hata-yazi' }, e.message))); }
}
const yenile = () => yonlendir();
const sorgu = () => new URLSearchParams(location.hash.split('?')[1] || '');
const ust = (baslik, alt, ...araclar) => h('div', { class: 'ust' }, h('div', null, h('h1', null, baslik), alt ? h('div', { class: 'soluk' }, alt) : null), h('div', { class: 'araclar' }, araclar));

// ---------- Panel ----------
async function panelSayfasi(icerik) {
  const [o, daireler] = await Promise.all([api('GET', `/api/ozet?yil=${durum.yil}${siteP()}`), api('GET', '/api/daireler' + siteP('?'))]);
  const kpi = (ad, deger, renk, alt) => h('div', { class: 'kpi ' + renk }, h('div', { class: 'ad' }, ad), h('div', { class: 'deger' }, deger), alt ? h('div', { class: 'soluk' }, alt) : null);
  const kartlar = daireler.filter((d) => d.aktif).map((d) => {
    const evSahibi = !d.sozlesme_id && d.ev_sahibi_oturuyor;
    const sinif = evSahibi ? 'ev-sahibi' : !d.sozlesme_id ? 'bos' : d.geciken_tutar > 0 ? 'gecikti' : d.acik_borc > 0 ? 'acik' : 'temiz';
    const durumYazi = evSahibi ? h('span', { class: 'rozet koyu' }, 'Ev sahibi oturuyor') : !d.sozlesme_id ? rozet('Boş') : d.geciken_tutar > 0 ? h('span', { class: 'rozet turuncu' }, `${d.gecikme_gun} gün gecikti`)
      : d.acik_borc > 0 ? h('span', { class: 'rozet mavi' }, 'Ödeme bekliyor') : rozet('Ödendi');
    return h('button', { class: 'daire-kart ' + sinif, type: 'button', onclick: () => (d.sozlesme_id ? sozlesmeDetay(d.sozlesme_id) : !yonetici() ? null : evSahibi ? daireFormu(d) : kiraciYerlestir(d)) },
      h('span', { class: 'no' }, daireAdi(d)),
      h('span', { class: 'kiraci' }, d.ad_soyad || (evSahibi ? d.ev_sahibi_ad || 'Ev sahibi' : 'Boş daire')),
      d.sozlesme_id ? h('span', { class: 'soluk' }, `${para(d.aylik_kira)} · her ayın ${d.odeme_gunu}'i`)
        : !evSahibi && d.ev_sahibi_ad ? h('span', { class: 'soluk' }, `Ev sahibi: ${d.ev_sahibi_ad}`)
        : h('span', { class: 'soluk' }, [d.tip, d.oda, d.metrekare ? d.metrekare + ' m²' : null].filter(Boolean).join(' · ')),
      h('span', { class: 'alt-satir' }, durumYazi, d.geciken_tutar > 0 ? h('b', { class: 'kalan' }, para(d.geciken_tutar)) : null));
  });
  icerik.replaceChildren(
    ust('Panel', `${durum.siteId ? durum.siteler.find((x) => x.id === durum.siteId)?.ad + ' · ' : durum.ben.site_idler?.length ? durum.siteler.map((x) => x.ad).join(', ') + ' · ' : cokSite() ? `${durum.siteler.filter((x) => x.aktif).length} site · ` : ''}${donemTR(o.donem)} · ${o.daire_toplam} daire (${o.daire_dolu} kiracılı, ${o.daire_ev_sahibi} ev sahibi, ${o.daire_bos} boş)`,
      yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => { location.hash = '#/banka'; } }, 'Ekstre yükle') : null,
      h('button', { class: 'dugme', onclick: () => odemeFormu() }, '+ Ödeme al')),
    h('div', { class: 'kpi-sira' },
      kpi('Bu ay beklenen', para(o.bu_ay_beklenen), 'komur'),
      kpi('Bu ay tahsil edilen', para(o.bu_ay_odenen), 'mavi', `%${o.tahsil_orani.toLocaleString('tr-TR')}`),
      kpi('Bu ay kalan', para(o.bu_ay_kalan), 'mavi'),
      kpi('Geciken', para(o.geciken_toplam), 'turuncu', `${o.geciken_kiraci} kiracı`),
      kpi('Yaklaşan ödeme', String(o.yaklasan_sayi), 'turuncu', `${durum.ayarlar?.yaklasan_gun ?? 3} gün içinde`)),
    h('div', { class: 'kart' },
      h('div', { class: 'kart-baslik' }, h('h2', null, 'Daireler'),
        h('div', { class: 'takvim-lejant' }, h('span', null, h('i', { class: 'l-dolu' }), 'Ödendi'), h('span', null, h('i', { class: 'l-kismi' }), 'Ödeme bekliyor'), h('span', null, h('i', { class: 'l-bugun' }), 'Gecikti'), h('span', null, h('i', { class: 'l-ev' }), 'Ev sahibi oturuyor'))),
      kartlar.length ? (cokSite() && !durum.siteId ? siteGruplari(daireler.filter((d) => d.aktif), kartlar) : h('div', { class: 'daire-izgara' }, kartlar))
        : h('div', { class: 'bos-liste' }, 'Henüz daire yok. ', yonetici() ? 'Daireler sayfasından ekleyin.' : '')),
    h('div', { class: 'kart grafik' },
      h('div', { class: 'kart-baslik' }, h('h2', null, `${durum.yil} kira borcu ve tahsilat`),
        h('div', { class: 'araclar' },
          h('button', { class: 'dugme ikincil kucuk', onclick: () => { durum.yil--; yenile(); } }, '‹'), h('b', null, String(durum.yil)),
          h('button', { class: 'dugme ikincil kucuk', onclick: () => { durum.yil++; yenile(); } }, '›'))),
      cubukGrafik(o.aylar),
      h('div', { class: 'lejant' }, lejant('Kira borcu (tahakkuk)', 'var(--mavi)'), lejant('Tahsilat', 'var(--turuncu)'))));
}
function siteGruplari(daireler, kartlar) {
  const gruplar = new Map();
  daireler.forEach((d, i) => { if (!gruplar.has(d.site)) gruplar.set(d.site, []); gruplar.get(d.site).push(kartlar[i]); });
  return [...gruplar].map(([site, k]) => h('div', { class: 'site-grup' },
    h('h3', null, site, h('span', { class: 'soluk' }, ` · ${k.length} daire`)), h('div', { class: 'daire-izgara' }, k)));
}
function lejant(ad, renk) { const el = h('span', null, ad); el.style.setProperty('--renk', renk); return el; }
function cubukGrafik(aylar) {
  const G = 720; const Y = 240; const sol = 56; const alt = 28; const ustB = 10;
  const enBuyuk = Math.max(1, ...aylar.flatMap((a) => [a.tahakkuk, a.tahsilat]));
  const adim = (G - sol - 8) / 12; const olcek = (n) => ((Y - alt - ustB) * n) / enBuyuk;
  const svg = s('svg', { viewBox: `0 0 ${G} ${Y}`, role: 'img', 'aria-label': 'Aylık kira borcu ve tahsilat grafiği' });
  for (let i = 0; i <= 4; i++) {
    const d = (enBuyuk / 4) * i; const yy = Y - alt - olcek(d);
    svg.append(s('line', { x1: sol, x2: G - 4, y1: yy, y2: yy, stroke: '#E2E2E6', 'stroke-width': 1 }));
    svg.append(s('text', { x: sol - 6, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#6B7085' }, kisaPara(d)));
  }
  aylar.forEach((a, i) => {
    const x = sol + i * adim + adim * 0.15; const w = adim * 0.33;
    svg.append(s('rect', { x, y: Y - alt - olcek(a.tahakkuk), width: w, height: olcek(a.tahakkuk), rx: 3, fill: '#105BFF' }, s('title', {}, `${AYLAR[i]} kira borcu: ${para(a.tahakkuk)}`)));
    svg.append(s('rect', { x: x + w + 2, y: Y - alt - olcek(a.tahsilat), width: w, height: olcek(a.tahsilat), rx: 3, fill: '#FE8500' }, s('title', {}, `${AYLAR[i]} tahsilat: ${para(a.tahsilat)}`)));
    svg.append(s('text', { x: x + w, y: Y - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#6B7085' }, AYLAR[i].slice(0, 3)));
  });
  return svg;
}

// ---------- Daireler ----------
async function dairelerSayfasi(icerik) {
  const l = await api('GET', '/api/daireler' + siteP('?'));
  icerik.replaceChildren(
    ust('Daireler', `${l.filter((d) => d.aktif).length} daire`, yonetici() ? h('button', { class: 'dugme', onclick: () => daireFormu() }, '+ Daire') : null),
    h('div', { class: 'kart' }, tablo(['Daire', 'Kat', 'Tip', 'Oda', ['m²', 'sayi'], 'Oturan', 'Ev sahibi', ['Kira', 'sayi'], 'Durum', ''],
      l.map((d) => h('tr', { class: d.aktif ? '' : 'iptal' },
        h('td', null, h('b', null, adi(d))), h('td', null, d.kat || ''), h('td', null, d.tip), h('td', null, d.oda || ''), h('td', { class: 'sayi' }, d.metrekare || ''),
        h('td', null, d.ad_soyad || (d.durum === 'Ev sahibi' ? 'Ev sahibi' : '—')),
        h('td', null, d.ev_sahibi_ad || h('span', { class: 'soluk' }, '—'), d.ev_sahibi_telefon ? h('div', { class: 'soluk' }, d.ev_sahibi_telefon) : null),
        h('td', { class: 'sayi' }, d.aylik_kira ? para(d.aylik_kira) : ''), h('td', null, rozet(d.durum)),
        h('td', null, d.sozlesme_id ? h('button', { class: 'dugme ikincil kucuk', onclick: () => sozlesmeDetay(d.sozlesme_id) }, 'Kiracı') : null,
          ' ', yonetici() && !d.sozlesme_id && d.aktif ? h('button', { class: 'dugme kucuk', onclick: () => kiraciYerlestir(d) }, 'Kiracı yerleştir') : null,
          ' ', yonetici() ? h('button', { class: 'dugme ikincil kucuk', onclick: () => daireFormu(d) }, 'Düzenle') : null))),
      'Henüz daire yok.')));
}
function daireFormu(d = null) {
  const aktifSiteler = durum.siteler.filter((x) => x.aktif || x.id === d?.site_id);
  basitForm(d ? `Daire · ${daireAdi(d)}` : 'Yeni daire', [
    aktifSiteler.length > 1 ? alan('Site', secimGirdi('site_id', aktifSiteler.map((x) => [x.id, x.ad]), d?.site_id ?? durum.siteId ?? aktifSiteler[0].id), true) : null,
    alan('Blok', metinGirdi('blok', { value: d?.blok, maxlength: 30, placeholder: 'ör. A' })),
    alan('Daire no', metinGirdi('daire_no', { value: d?.daire_no, required: true, maxlength: 30 })),
    alan('Kat', metinGirdi('kat', { value: d?.kat, maxlength: 10 })),
    alan('Oda', metinGirdi('oda', { value: d?.oda, maxlength: 20, placeholder: 'ör. 3+1' })),
    alan('Metrekare', tutarGirdi('metrekare', { value: d?.metrekare, placeholder: '' })),
    alan('Tip', secimGirdi('tip', ['Konut', 'İşyeri', 'Depo', 'Diğer'], d?.tip || 'Konut')),
    alan('Adres / açıklama', metinGirdi('adres', { value: d?.adres, maxlength: 500 }), true),
    alan('Not', h('textarea', { name: 'notlar', rows: 2, maxlength: 2000 }, d?.notlar || ''), true),
    h('h3', { class: 'tam' }, 'Kat maliki (ev sahibi)'),
    alan('Ad soyad', metinGirdi('es_ad_soyad', { value: d?.ev_sahibi_ad, maxlength: 120, placeholder: 'Boş bırakılırsa malik kaydı tutulmaz' })),
    alan('Telefon', metinGirdi('es_telefon', { value: d?.ev_sahibi_telefon, inputmode: 'tel', maxlength: 30 })),
    alan('E-posta', h('input', { type: 'email', name: 'es_eposta', value: d?.ev_sahibi_eposta, maxlength: 200 })),
    alan('IBAN', metinGirdi('es_iban', { value: d?.ev_sahibi_iban, maxlength: 40, placeholder: 'TR..' })),
    !d?.sozlesme_id ? h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'ev_sahibi_oturuyor', checked: d?.ev_sahibi_oturuyor }), kiraAcik() ? 'Dairede malik oturuyor (kira borcu yazılmaz)' : 'Dairede malik oturuyor')
      : h('p', { class: 'tam soluk' }, 'Dairede kiracı oturuyor.'),
    d ? h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'aktif', checked: d.aktif }), 'Aktif (kullanılan daireler arasında)') : null,
  ], async (v) => {
    v.ev_sahibi = v.es_ad_soyad ? { ad_soyad: v.es_ad_soyad, telefon: v.es_telefon, eposta: v.es_eposta, iban: v.es_iban } : null;
    for (const k of ['es_ad_soyad', 'es_telefon', 'es_eposta', 'es_iban']) delete v[k];
    if (v.site_id) v.site_id = Number(v.site_id); if (d) await api('PUT', `/api/daireler/${d.id}`, v); else await api('POST', '/api/daireler', v); bildir('Daire kaydedildi.'); });
}

// ---------- Kiracılar ve sözleşmeler ----------
async function kiracilarSayfasi(icerik) {
  const d = sorgu().get('durum') ?? 'Aktif';
  const l = await api('GET', '/api/sozlesmeler' + (d ? `?durum=${encodeURIComponent(d)}${siteP()}` : siteP('?')));
  icerik.replaceChildren(
    ust('Kiracılar', `${l.length} kayıt · toplam açık bakiye `,
      h('select', { class: 'secim', onchange: (e) => { location.hash = '#/kiracilar?durum=' + encodeURIComponent(e.target.value); } },
        [['Aktif', 'Oturanlar'], ['Ayrıldı', 'Ayrılanlar'], ['', 'Hepsi']].map(([v, y]) => h('option', { value: v, selected: v === d }, y))),
      yonetici() ? h('button', { class: 'dugme', onclick: () => kiraciYerlestir() }, '+ Kiracı yerleştir') : null),
    h('div', { class: 'kart' }, tablo(['Daire', 'Kiracı', 'Telefon', ['Aylık kira', 'sayi'], 'Ödeme günü', 'Başlangıç', ['Bakiye', 'sayi'], ['Avans', 'sayi'], 'Durum'],
      l.map((x) => h('tr', { class: 'tik', onclick: () => sozlesmeDetay(x.id) },
        h('td', null, h('b', null, adi(x))), h('td', null, x.ad_soyad), h('td', null, x.telefon || ''), h('td', { class: 'sayi' }, para(x.aylik_kira)),
        h('td', null, `Her ayın ${x.odeme_gunu}'i`), h('td', null, tarihTR(x.baslangic)),
        h('td', { class: 'sayi' + (x.bakiye > 0 ? ' kalan' : '') }, para(x.bakiye)), h('td', { class: 'sayi' }, x.avans > 0 ? para(x.avans) : '—'), h('td', null, rozet(x.durum)))),
      'Kayıt yok.')));
  const toplam = l.reduce((a, x) => a + x.bakiye, 0);
  icerik.querySelector('.ust .soluk').append(h('span', { class: 'kalan' }, para(toplam)));
}

async function kiraciYerlestir(daire = null) {
  const [daireler, ayar] = await Promise.all([api('GET', '/api/daireler' + siteP('?')), durum.ayarlar ? Promise.resolve(durum.ayarlar) : api('GET', '/api/ayarlar')]);
  const bos = daireler.filter((d) => d.aktif && !d.sozlesme_id);
  const etiket = (d) => `${cokSite() ? d.site + ' · ' : ''}${daireAdi(d)}${d.ev_sahibi_oturuyor ? ' (şu an ev sahibi oturuyor)' : ''}`;
  if (!bos.length) { bildir('Boş daire yok. Önce daire ekleyin ya da bir kiracıyı "Ayrıldı" yapın.', true); return; }
  basitForm('Kiracı yerleştir', [
    alan('Daire', secimGirdi('daire_id', bos.sort((a, b) => a.ev_sahibi_oturuyor - b.ev_sahibi_oturuyor).map((d) => [d.id, etiket(d)]), daire?.id), true),
    h('h3', { class: 'tam' }, 'Kiracı'),
    alan('Ad soyad', metinGirdi('k_ad_soyad', { required: true, maxlength: 120 })),
    alan('Telefon', metinGirdi('k_telefon', { inputmode: 'tel', maxlength: 30 })),
    alan('E-posta', h('input', { name: 'k_eposta', type: 'email', maxlength: 200 })),
    alan('T.C. kimlik no (isteğe bağlı, şifreli saklanır)', metinGirdi('k_tc', { inputmode: 'numeric', maxlength: 11 })),
    alan('IBAN (banka eşleştirmesi için)', metinGirdi('k_iban', { maxlength: 40, placeholder: 'TR..' })),
    alan('Ödeme açıklama kodu', metinGirdi('k_odeme_kodu', { maxlength: 30, placeholder: 'ör. A15 — havale açıklamasına yazılır' })),
    h('h3', { class: 'tam' }, 'Sözleşme'),
    alan('Başlangıç', tarihGirdi('baslangic', { value: bugun(), required: true })),
    alan('Bitiş (isteğe bağlı)', tarihGirdi('bitis')),
    alan('Aylık kira', tutarGirdi('aylik_kira', { required: true })),
    alan('Depozito', tutarGirdi('depozito')),
    alan('Ödeme günü', h('input', { type: 'number', name: 'odeme_gunu', min: 1, max: 31, value: ayar.varsayilan_odeme_gunu, 'data-tur': 'sayi' })),
    alan('Not', h('textarea', { name: 'notlar', rows: 2, maxlength: 2000 }), true),
    h('p', { class: 'tam soluk' }, 'Sözleşme bu ayı kapsıyorsa bu ayın kira borcu hemen oluşur; sonraki aylar her ay kendiliğinden eklenir.'),
  ], async (v) => {
    const kisi = {};
    for (const k of Object.keys(v)) if (k.startsWith('k_')) { kisi[k.slice(2)] = v[k]; delete v[k]; }
    v.daire_id = Number(v.daire_id);
    const r = await api('POST', '/api/sozlesmeler', { ...v, kisi });
    bildir('Kiracı yerleştirildi.');
    setTimeout(() => sozlesmeDetay(r.id), 50);
  }, { dugmeYazi: 'Kiracıyı yerleştir', genis: true });
}

async function sozlesmeDetay(id) {
  const x = await api('GET', `/api/sozlesmeler/${id}`);
  const k = await api('GET', `/api/kisiler/${x.kisi_id}`);
  const aktif = x.durum === 'Aktif';
  let kapat;
  const yeniden = () => { kapat(); sozlesmeDetay(id); yenile(); };
  const tcAlan = h('span', { class: 'tc-maske' }, k.tc_son4 ? `•••••••${k.tc_son4}` : '—');
  const govde = h('div', null,
    h('div', null, rozet(x.durum), ' ', x.bakiye > 0 ? h('span', { class: 'rozet turuncu' }, 'Açık bakiye') : null),
    h('div', { class: 'iki-sutun' },
      h('dl', { class: 'bilgi-satir' },
        cokSite() ? [h('dt', null, 'Site'), h('dd', null, x.site)] : null,
        h('dt', null, 'Daire'), h('dd', null, daireAdi(x)),
        x.ev_sahibi_ad ? [h('dt', null, 'Ev sahibi'), h('dd', null, x.ev_sahibi_ad, x.ev_sahibi_telefon ? h('span', { class: 'soluk' }, ` · ${x.ev_sahibi_telefon}`) : null)] : null,
        h('dt', null, 'Kiracı'), h('dd', null, x.ad_soyad),
        h('dt', null, 'Telefon'), h('dd', null, k.telefon || '—'),
        h('dt', null, 'T.C. kimlik'), h('dd', null, tcAlan, ' ', yonetici() && k.tc_son4 ? h('button', { class: 'dugme ikincil kucuk', onclick: async (e) => {
          const r = await api('GET', `/api/kisiler/${k.id}/tc`); tcAlan.textContent = r.tc || '—'; e.target.remove();
        } }, 'Göster') : null),
        h('dt', null, 'IBAN'), h('dd', null, k.iban || '—'),
        h('dt', null, 'Ödeme kodu'), h('dd', null, k.odeme_kodu || '—')),
      h('dl', { class: 'bilgi-satir' },
        h('dt', null, 'Aylık kira'), h('dd', null, para(x.aylik_kira)),
        h('dt', null, 'Ödeme günü'), h('dd', null, `Her ayın ${x.odeme_gunu}'i`),
        h('dt', null, 'Sözleşme'), h('dd', null, `${tarihTR(x.baslangic)} – ${x.bitis ? tarihTR(x.bitis) : 'süresiz'}`),
        h('dt', null, 'Depozito'), h('dd', null, para(x.depozito)),
        x.ayrilis_tarihi ? [h('dt', null, 'Ayrılış'), h('dd', null, tarihTR(x.ayrilis_tarihi))] : null)),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Toplam kira borcu'), h('b', null, para(x.toplam_borc))),
      h('div', null, h('small', null, 'Toplam ödeme'), h('b', null, para(x.toplam_odeme))),
      h('div', null, h('small', null, x.avans > 0 ? 'Avans (sonraki aylara)' : 'Açık bakiye'), h('b', { class: x.bakiye > 0 ? 'kalan' : '' }, para(x.avans > 0 ? x.avans : x.bakiye)))),
    h('h3', null, 'Aylık kira borçları'),
    tablo(['Dönem', 'Vade', ['Kira', 'sayi'], ['Ödenen', 'sayi'], ['Kalan', 'sayi'], 'Durum', ''], x.borclar.map((b) => h('tr', null,
      h('td', null, donemTR(b.donem)), h('td', null, tarihTR(b.vade)), h('td', { class: 'sayi' }, para(b.tutar)), h('td', { class: 'sayi' }, para(b.odenen)),
      h('td', { class: 'sayi' + (b.kalan > 0 ? ' kalan' : '') }, para(b.kalan)),
      h('td', null, rozet(b.durum), b.durum === 'Gecikti' ? h('span', { class: 'soluk' }, ` ${b.gecikme_gun} gün`) : null),
      h('td', null, yonetici() ? h('button', { class: 'dugme tehlike kucuk', onclick: () => borcIptal(b, yeniden) }, 'İptal') : null))), 'Borç yok.'),
    h('h3', null, 'Ödemeler'),
    tablo(['Tarih', 'Kaynak', 'Ödeme', 'Açıklama', ['Tutar', 'sayi'], ''], x.tahsilatlar.map((t) => h('tr', { class: t.iptal ? 'iptal' : '' },
      h('td', null, tarihTR(t.tarih)), h('td', null, t.kaynak), h('td', null, t.odeme_turu), h('td', null, t.iptal ? `İptal: ${t.iptal_nedeni || ''}` : t.aciklama || ''),
      h('td', { class: 'sayi' }, para(t.tutar)),
      h('td', null, yonetici() && !t.iptal ? h('button', { class: 'dugme tehlike kucuk', onclick: () => tahsilatIptal(t, yeniden) }, 'İptal') : null))), 'Henüz ödeme yok.'));
  const dugmeler = [
    yonetici() && aktif ? h('button', { class: 'dugme tehlike', onclick: () => { kapat(); ayrilFormu(x); } }, 'Kiracı ayrıldı') : null,
    yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => { kapat(); kisiFormu(k, () => sozlesmeDetay(id)); } }, 'Kiracı bilgileri') : null,
    yonetici() && aktif ? h('button', { class: 'dugme ikincil', onclick: () => { kapat(); sozlesmeFormu(x); } }, 'Sözleşmeyi düzenle') : null,
    h('button', { class: 'dugme turuncu', onclick: () => { kapat(); odemeFormu(x); } }, 'Ödeme al'),
  ].filter(Boolean);
  kapat = pencere(`${cokSite() ? x.site + ' · ' : ''}${daireAdi(x)} · ${x.ad_soyad}`, govde, dugmeler, { genis: true });
}

function kisiFormu(k, sonra) {
  basitForm(`Kiracı · ${k.ad_soyad}`, [
    alan('Ad soyad', metinGirdi('ad_soyad', { value: k.ad_soyad, required: true, maxlength: 120 })),
    alan('Telefon', metinGirdi('telefon', { value: k.telefon, maxlength: 30 })),
    alan('E-posta', h('input', { type: 'email', name: 'eposta', value: k.eposta, maxlength: 200 })),
    alan(k.tc_son4 ? `T.C. kimlik no (kayıtlı: •••${k.tc_son4}; değişmeyecekse boş)` : 'T.C. kimlik no', metinGirdi('tc', { inputmode: 'numeric', maxlength: 11 })),
    alan('IBAN', metinGirdi('iban', { value: k.iban, maxlength: 40 })),
    alan('Ödeme açıklama kodu', metinGirdi('odeme_kodu', { value: k.odeme_kodu, maxlength: 30 })),
    k.tc_son4 ? h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'tc_sil' }), 'Kayıtlı T.C. kimlik nosunu sil') : null,
    alan('Not', h('textarea', { name: 'notlar', rows: 2, maxlength: 2000 }, k.notlar || ''), true),
  ], async (v) => { await api('PUT', `/api/kisiler/${k.id}`, v); bildir('Kiracı bilgileri kaydedildi.'); setTimeout(sonra, 50); });
}

function sozlesmeFormu(x) {
  basitForm(`Sözleşme · ${daireAdi(x)}`, [
    alan('Aylık kira', tutarGirdi('aylik_kira', { value: x.aylik_kira, required: true })),
    alan('Depozito', tutarGirdi('depozito', { value: x.depozito })),
    alan('Ödeme günü', h('input', { type: 'number', name: 'odeme_gunu', min: 1, max: 31, value: x.odeme_gunu, 'data-tur': 'sayi' })),
    alan('Bitiş', tarihGirdi('bitis', { value: x.bitis })),
    h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'bu_ay_da' }), 'Yeni kira tutarı bu ayın borcuna da uygulansın'),
    alan('Not', h('textarea', { name: 'notlar', rows: 2, maxlength: 2000 }, x.notlar || ''), true),
    h('p', { class: 'tam soluk' }, 'Kira artışı geçmiş ayları değiştirmez; sonraki aylar yeni tutarla oluşur.'),
  ], async (v) => { if (v.bitis === undefined) v.bitis = null; await api('PUT', `/api/sozlesmeler/${x.id}`, v); bildir('Sözleşme güncellendi.'); setTimeout(() => sozlesmeDetay(x.id), 50); });
}

function ayrilFormu(x) {
  basitForm(`Kiracı ayrıldı · ${daireAdi(x)}`, [
    h('p', { class: 'tam' }, `${x.ad_soyad} için sözleşme kapanacak ve daire boşalacak. Ayrılış ayından sonraki kira borçları iptal edilir; açık kalan borçlar alacak olarak görünmeye devam eder.`),
    alan('Ayrılış tarihi', tarihGirdi('tarih', { value: bugun(), required: true })),
  ], async (v) => { await api('POST', `/api/sozlesmeler/${x.id}/ayril`, v); bildir('Kiracı ayrıldı olarak kaydedildi, daire boşaldı.'); }, { dugmeYazi: 'Ayrıldı olarak kaydet' });
}

async function odemeFormu(x = null) {
  const liste = x ? [x] : await api('GET', '/api/sozlesmeler?durum=Aktif' + siteP());
  if (!liste.length) { bildir('Aktif kiracı yok.', true); return; }
  basitForm(x ? `Ödeme al · ${daireAdi(x)}` : 'Ödeme al', [
    alan('Kiracı', secimGirdi('sozlesme_id', liste.map((s) => [s.id, `${adi(s)} · ${s.ad_soyad}${s.bakiye > 0 ? ` (bakiye ${para(s.bakiye)})` : ''}`]), x?.id), true),
    alan('Tutar', tutarGirdi('tutar', { required: true, value: x && x.bakiye > 0 ? x.bakiye : undefined })),
    alan('Tarih', tarihGirdi('tarih', { value: bugun(), required: true, max: bugun() })),
    alan('Ödeme türü', secimGirdi('odeme_turu', ODEME_TURLERI, 'Nakit')),
    alan('Açıklama', metinGirdi('aciklama', { maxlength: 500 })),
    h('p', { class: 'tam soluk' }, 'Ödeme en eski açık borçtan başlayarak düşer; fazlası sonraki aylara avans olarak geçer.'),
  ], async (v) => { v.sozlesme_id = Number(v.sozlesme_id); await api('POST', '/api/tahsilatlar', v); bildir('Ödeme kaydedildi.'); });
}

function tahsilatIptal(t, sonra) {
  const neden = prompt(`${tarihTR(t.tarih)} · ${para(t.tutar)} ödeme iptal edilsin mi? Nedeni yazın:`);
  if (!neden) return;
  api('POST', `/api/tahsilatlar/${t.id}/iptal`, { neden }).then(() => { bildir('Ödeme iptal edildi; kalan ödemeler yeniden dağıtıldı.'); sonra(); }).catch((e) => bildir(e.message, true));
}
function borcIptal(b, sonra) {
  const neden = prompt(`${donemTR(b.donem)} kira borcu (${para(b.tutar)}) iptal edilsin mi? Nedeni yazın:`);
  if (!neden) return;
  api('POST', `/api/borclar/${b.id}/iptal`, { neden }).then(() => { bildir('Borç iptal edildi.'); sonra(); }).catch((e) => bildir(e.message, true));
}

// ---------- Kira takibi ----------
async function kiraTakibiSayfasi(icerik) {
  const q = sorgu();
  const donem = q.get('donem') || buAy();
  const d = q.get('durum') || '';
  const l = await api('GET', `/api/borclar?donem=${donem}${d ? '&durum=' + encodeURIComponent(d) : ''}${siteP()}`);
  const git = (deg) => { const n = new URLSearchParams({ donem, durum: d, ...deg }); location.hash = '#/kira-takibi?' + n; };
  const t = l.reduce((a, b) => ({ tutar: a.tutar + b.tutar, odenen: a.odenen + b.odenen, kalan: a.kalan + b.kalan }), { tutar: 0, odenen: 0, kalan: 0 });
  const donemG = h('input', { type: 'month', class: 'secim', value: donem, onchange: (e) => e.target.value && git({ donem: e.target.value }) });
  icerik.replaceChildren(
    ust('Kira Takibi', `${donemTR(donem)} · ${l.length} kayıt`,
      h('button', { class: 'dugme ikincil', onclick: () => git({ donem: ayKaydir(donem, -1) }) }, '‹'), donemG,
      h('button', { class: 'dugme ikincil', onclick: () => git({ donem: ayKaydir(donem, 1) }) }, '›'),
      h('select', { class: 'secim', onchange: (e) => git({ durum: e.target.value }) },
        [['', 'Hepsi'], ['Açık', 'Ödenmemiş'], ['Gecikti', 'Gecikenler'], ['Kısmi Ödendi', 'Kısmi'], ['Ödendi', 'Ödenenler']].map(([v, y]) => h('option', { value: v, selected: v === d }, y))),
      yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => api('POST', '/api/borclar/olustur', { donem }).then((r) => { bildir(r.olusan ? `${r.olusan} kira borcu oluşturuldu.` : 'Bu dönemin borçları zaten oluşmuş.'); yenile(); }).catch((e) => bildir(e.message, true)) }, 'Bu dönemin borçlarını oluştur') : null,
      h('button', { class: 'dugme', onclick: () => odemeFormu() }, '+ Ödeme al')),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Beklenen'), h('b', null, para(t.tutar))),
      h('div', null, h('small', null, 'Tahsil edilen'), h('b', null, para(t.odenen))),
      h('div', null, h('small', null, 'Kalan'), h('b', { class: t.kalan > 0 ? 'kalan' : '' }, para(t.kalan)))),
    h('div', { class: 'kart' }, tablo(['Daire', 'Kiracı', 'Vade', ['Kira', 'sayi'], ['Ödenen', 'sayi'], ['Kalan', 'sayi'], 'Son ödeme', 'Durum', ''],
      l.map((b) => h('tr', null,
        h('td', null, h('b', null, adi(b))), h('td', null, b.ad_soyad, b.sozlesme_durum === 'Ayrıldı' ? h('span', { class: 'soluk' }, ' (ayrıldı)') : null),
        h('td', null, tarihTR(b.vade)), h('td', { class: 'sayi' }, para(b.tutar)), h('td', { class: 'sayi' }, para(b.odenen)),
        h('td', { class: 'sayi' + (b.kalan > 0 ? ' kalan' : '') }, para(b.kalan)), h('td', null, tarihTR(b.son_odeme)),
        h('td', null, rozet(b.durum), b.durum === 'Gecikti' ? h('span', { class: 'soluk' }, ` ${b.gecikme_gun} gün`) : b.yaklasan ? h('span', { class: 'soluk' }, ' yaklaşıyor') : null),
        h('td', null, b.kalan > 0 ? h('button', { class: 'dugme turuncu kucuk', onclick: () => api('GET', `/api/sozlesmeler/${b.sozlesme_id}`).then(odemeFormu) }, 'Ödeme al') : null,
          ' ', h('button', { class: 'dugme ikincil kucuk', onclick: () => sozlesmeDetay(b.sozlesme_id) }, 'Aç')))),
      `${donemTR(donem)} için kira borcu yok.`)));
}

// ---------- Gecikenler ----------
async function gecikenlerSayfasi(icerik) {
  const l = await api('GET', '/api/gecikenler' + siteP('?'));
  const toplam = l.reduce((a, g) => a + g.geciken_tutar, 0);
  icerik.replaceChildren(
    ust('Gecikenler', `${l.length} kiracı · toplam `),
    h('div', { class: 'kart' }, l.length ? l.map((g) => h('div', { class: 'geciken-kart' },
      h('div', null,
        h('h3', null, `${adi(g)} · ${g.ad_soyad}`, g.sozlesme_durum === 'Ayrıldı' ? h('span', { class: 'soluk' }, ' (ayrıldı)') : null),
        h('div', { class: 'soluk' }, `${g.donemler.map(donemTR).join(', ')} · ${g.gecikme_gun} gün gecikme · son ödeme ${g.son_odeme ? tarihTR(g.son_odeme) : 'yok'}`),
        h('div', { class: 'sms-kutu' }, g.sms)),
      h('div', null,
        h('div', { class: 'tutar' }, para(g.geciken_tutar)),
        h('div', { class: 'araclar' },
          h('button', { class: 'dugme ikincil kucuk', onclick: () => navigator.clipboard.writeText(g.sms).then(() => bildir('Mesaj kopyalandı.'), () => bildir('Kopyalanamadı.', true)) }, 'Mesajı kopyala'),
          g.whatsapp ? h('a', { class: 'dugme ikincil kucuk', href: g.whatsapp, target: '_blank', rel: 'noopener' }, 'WhatsApp') : null,
          h('button', { class: 'dugme turuncu kucuk', onclick: () => api('GET', `/api/sozlesmeler/${g.sozlesme_id}`).then(odemeFormu) }, 'Ödeme al'))))) : h('div', { class: 'bos-liste' }, 'Geciken ödeme yok. 👍')));
  icerik.querySelector('.ust .soluk').append(h('span', { class: 'kalan' }, para(toplam)));
}

// ---------- Banka ekstresi ----------
async function bankaSayfasi(icerik) {
  const d = sorgu().get('durum') ?? 'Açık';
  const l = await api('GET', '/api/banka' + (d ? `?durum=${encodeURIComponent(d)}` : ''));
  const dosya = h('input', { type: 'file', accept: '.csv,.xlsx,.txt' });
  const yukleDugme = h('button', { class: 'dugme', onclick: () => ekstreYukle(dosya, yukleDugme) }, 'Yükle ve eşleştir');
  icerik.replaceChildren(
    ust('Banka Ekstresi', 'Ödemeler açıklama kodu, IBAN, ad soyad, tutar ve tarihe göre puanlanıp kiracıyla eşleştirilir.',
      h('button', { class: 'dugme ikincil', onclick: () => api('POST', '/api/banka/yeniden-esle', {}).then((r) => { bildir(`Yeniden denendi: ${r.otomatik} otomatik, ${r.kontrol} kontrol, ${r.eslesmedi} eşleşmeyen.`); yenile(); }).catch((e) => bildir(e.message, true)) }, 'Bekleyenleri yeniden eşleştir')),
    h('div', { class: 'kart' },
      h('div', { class: 'dosya-sec' },
        h('b', null, 'Bankanızdan indirdiğiniz ekstreyi seçin (XLSX ya da CSV)'),
        h('div', { class: 'soluk' }, 'Tarih, Açıklama ve Tutar (ya da Alacak) sütunları yeterli. Aynı ekstreyi tekrar yüklerseniz hareketler ikinci kez girmez.'),
        h('div', null, dosya, ' ', yukleDugme))),
    h('div', { class: 'kart' },
      h('div', { class: 'kart-baslik' }, h('h2', null, 'Hareketler'),
        h('select', { class: 'secim', onchange: (e) => { location.hash = '#/banka?durum=' + encodeURIComponent(e.target.value); } },
          [['Açık', 'İşlem bekleyenler'], ['Otomatik Eşleşti', 'Otomatik eşleşenler'], ['Elle Eşleşti', 'Elle eşleşenler'], ['Yok Sayıldı', 'Yok sayılanlar'], ['', 'Hepsi']]
            .map(([v, y]) => h('option', { value: v, selected: v === d }, y)))),
      tablo(['Tarih', 'Açıklama / gönderen', ['Tutar', 'sayi'], 'Durum', 'Kiracı', ''], l.map((x) => h('tr', null,
        h('td', null, tarihTR(x.tarih)), h('td', null, x.aciklama, x.gonderen ? h('div', { class: 'soluk' }, x.gonderen) : null),
        h('td', { class: 'sayi' }, para(x.tutar)),
        h('td', null, rozet(x.durum), x.puan !== null ? h('div', { class: 'soluk', title: x.detay || '' }, `${x.puan} puan`) : null),
        h('td', null, x.eslesen_kiraci ? `${adi({ site: x.eslesen_site, blok: x.eslesen_blok, daire_no: x.eslesen_daire_no })} · ${x.eslesen_kiraci}`
          : x.onerilen_kiraci ? h('span', { class: 'soluk' }, `Öneri: ${adi({ site: x.onerilen_site, blok: x.onerilen_blok, daire_no: x.onerilen_daire_no })} · ${x.onerilen_kiraci}`) : '—'),
        h('td', null, !x.tahsilat_id && x.durum !== 'Yok Sayıldı' ? [
          h('button', { class: 'dugme kucuk', onclick: () => elleEslestir(x) }, x.onerilen_sozlesme_id ? 'Onayla / değiştir' : 'Eşleştir'), ' ',
          h('button', { class: 'dugme ikincil kucuk', onclick: () => api('POST', `/api/banka/${x.id}/yok-say`, {}).then(() => { bildir('Yok sayıldı.'); yenile(); }).catch((e) => bildir(e.message, true)) }, 'Kira değil')] : null))),
      'Bu görünümde hareket yok.')));
}
function ekstreYukle(dosya, dugme) {
  const f = dosya.files[0];
  if (!f) { bildir('Önce bir dosya seçin.', true); return; }
  if (f.size > 5 * 1024 * 1024) { bildir('Dosya en fazla 5 MB olabilir.', true); return; }
  dugme.disabled = true;
  const r = new FileReader();
  r.onload = () => {
    api('POST', '/api/banka/yukle', { dosya_adi: f.name, icerik_base64: String(r.result).split(',')[1] || '' })
      .then((x) => { bildir(`${x.eklenen} yeni hareket (${x.mukerrer} zaten yüklüydü). Otomatik: ${x.otomatik}, kontrol: ${x.kontrol}, eşleşmeyen: ${x.eslesmedi}.`); yenile(); })
      .catch((e) => bildir(e.message, true)).finally(() => { dugme.disabled = false; });
  };
  r.readAsDataURL(f);
}
async function elleEslestir(x) {
  const l = await api('GET', '/api/sozlesmeler');
  basitForm('Hareketi kiracıyla eşleştir', [
    h('p', { class: 'tam' }, `${tarihTR(x.tarih)} · ${para(x.tutar)} · ${x.aciklama}`),
    x.detay ? h('p', { class: 'tam soluk' }, `Puan ayrıntısı: ${x.detay}`) : null,
    alan('Kiracı', secimGirdi('sozlesme_id', l.map((s) => [s.id, `${cokSite() ? s.site + ' · ' : ''}${daireAdi(s)} · ${s.ad_soyad}${s.durum === 'Ayrıldı' ? ' (ayrıldı)' : ''}`]), x.onerilen_sozlesme_id), true),
  ], async (v) => { await api('POST', `/api/banka/${x.id}/eslestir`, { sozlesme_id: Number(v.sozlesme_id) }); bildir('Ödeme kiracıya işlendi.'); }, { dugmeYazi: 'Eşleştir ve ödemeyi işle' });
}

// ---------- Raporlar ----------
async function raporlarSayfasi(icerik) {
  const q = sorgu();
  const bas = q.get('baslangic') || `${durum.yil}-01`;
  const bit = q.get('bitis') || buAy();
  const d = q.get('durum') || '';
  const params = new URLSearchParams({ baslangic: bas, bitis: bit, ...(d ? { durum: d } : {}), ...(durum.siteId ? { site_id: durum.siteId } : {}) });
  const r = await api('GET', '/api/rapor?' + params);
  const basG = h('input', { type: 'month', class: 'secim', value: bas });
  const bitG = h('input', { type: 'month', class: 'secim', value: bit });
  const durumG = h('select', { class: 'secim' }, [['', 'Hepsi'], ['Açık', 'Ödenmemiş'], ['Gecikti', 'Gecikenler'], ['Ödendi', 'Ödenenler']].map(([v, y]) => h('option', { value: v, selected: v === d }, y)));
  icerik.replaceChildren(
    ust('Raporlar', `${donemTR(bas)} – ${donemTR(bit)} kira tahsilat raporu`,
      basG, bitG, durumG,
      h('button', { class: 'dugme ikincil', onclick: () => { location.hash = '#/raporlar?' + new URLSearchParams({ baslangic: basG.value, bitis: bitG.value, durum: durumG.value }); } }, 'Göster'),
      h('a', { class: 'dugme ikincil', href: '/api/rapor.csv?' + params, download: '' }, "Excel'e aktar"),
      h('button', { class: 'dugme', onclick: () => window.print() }, 'Yazdır / PDF')),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Kira toplamı'), h('b', null, para(r.toplam.tutar))),
      h('div', null, h('small', null, 'Ödenen'), h('b', null, para(r.toplam.odenen))),
      h('div', null, h('small', null, 'Kalan'), h('b', { class: r.toplam.kalan > 0 ? 'kalan' : '' }, para(r.toplam.kalan)))),
    h('div', { class: 'kart' }, tablo(['Dönem', 'Daire', 'Kiracı', 'Vade', ['Kira', 'sayi'], ['Ödenen', 'sayi'], ['Kalan', 'sayi'], 'Durum'],
      r.satirlar.map((b) => h('tr', null, h('td', null, donemTR(b.donem)), h('td', null, adi(b)), h('td', null, b.ad_soyad), h('td', null, tarihTR(b.vade)),
        h('td', { class: 'sayi' }, para(b.tutar)), h('td', { class: 'sayi' }, para(b.odenen)), h('td', { class: 'sayi' + (b.kalan > 0 ? ' kalan' : '') }, para(b.kalan)),
        h('td', null, rozet(b.durum)))), 'Bu aralıkta kayıt yok.')));
}

// ---------- Ayarlar ----------
async function ayarlarSayfasi(icerik) {
  const sekme = sorgu().get('sekme') || 'siteler';
  const sekmeler = h('div', { class: 'sekmeler' }, [['siteler', 'Siteler'], ['firma', 'Firma ve kurallar'], ['kullanicilar', 'Kullanıcılar'], ['kayit', 'İşlem kaydı']]
    .map(([k, y]) => h('button', { class: k === sekme ? 'aktif' : '', onclick: () => { location.hash = '#/ayarlar?sekme=' + k; } }, y)));
  let govde;
  if (sekme === 'siteler') {
    await siteleriYukle();
    govde = h('div', { class: 'kart' },
      h('div', { class: 'kart-baslik' }, h('div', null, h('h2', null, 'Siteler'), h('p', { class: 'soluk' }, 'Yönettiğiniz siteler. Her daire bir siteye bağlıdır; personele site ataması Kullanıcılar sekmesinden yapılır.')),
        h('button', { class: 'dugme kucuk', onclick: () => siteFormu() }, '+ Site')),
      tablo(['Site', 'Adres', ['Daire', 'sayi'], ['Kiracılı', 'sayi'], ['Ev sahibi', 'sayi'], ['Boş', 'sayi'], 'Durum', ''], durum.siteler.map((x) => h('tr', { class: x.aktif ? '' : 'iptal' },
        h('td', null, h('b', null, x.ad)), h('td', null, x.adres || ''), h('td', { class: 'sayi' }, x.daire_sayisi), h('td', { class: 'sayi' }, x.dolu),
        h('td', { class: 'sayi' }, x.ev_sahibi), h('td', { class: 'sayi' }, x.daire_sayisi - x.dolu - x.ev_sahibi),
        h('td', null, rozet(x.aktif ? 'Aktif' : 'Pasif')),
        h('td', null, h('button', { class: 'dugme ikincil kucuk', onclick: () => siteFormu(x) }, 'Düzenle'))))));
  } else if (sekme === 'firma') {
    const a = await api('GET', '/api/ayarlar');
    const hataEl = h('div', { class: 'hata-yazi' });
    const dugme = h('button', { class: 'dugme', type: 'submit' }, 'Kaydet');
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); gonder(dugme, hataEl, async () => {
      const r = await api('PUT', '/api/ayarlar', formVerisi(form)); durum.ayarlar = r; durum.ben.firma_ad = r.ad; bildir('Ayarlar kaydedildi.'); yerlesim(); yonlendir();
    }); } }, h('div', { class: 'form' },
      alan('Firma adı', metinGirdi('ad', { value: a.ad, required: true }), true),
      alan('Vadeden kaç gün sonra "Gecikti" sayılsın', h('input', { type: 'number', name: 'gecikme_gun', min: 0, max: 60, value: a.gecikme_gun, 'data-tur': 'sayi' })),
      alan('Vadeye kaç gün kala "yaklaşan" uyarısı', h('input', { type: 'number', name: 'yaklasan_gun', min: 0, max: 60, value: a.yaklasan_gun, 'data-tur': 'sayi' })),
      alan('Yeni kiracıda varsayılan ödeme günü', h('input', { type: 'number', name: 'varsayilan_odeme_gunu', min: 1, max: 31, value: a.varsayilan_odeme_gunu, 'data-tur': 'sayi' })),
      h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'kira_modulu', checked: a.kira_modulu }),
        'Kira bölümü (kiralık dairelerin kira takibi: kiracılar, aylık kira, geciken kiralar, banka ekstresi)'),
      h('div', { class: 'tam' }, hataEl, dugme)));
    govde = h('div', { class: 'kart' }, form);
  } else if (sekme === 'kullanicilar') {
    const l = await api('GET', '/api/kullanicilar');
    govde = h('div', { class: 'kart' },
      h('div', { class: 'kart-baslik' }, h('h2', null, 'Kullanıcılar'), h('button', { class: 'dugme kucuk', onclick: () => kullaniciFormu() }, '+ Kullanıcı')),
      tablo(['Ad soyad', 'E-posta', 'Rol', 'Siteler', 'Durum', ''], l.map((k) => h('tr', { class: k.aktif ? '' : 'iptal' },
        h('td', null, k.ad_soyad), h('td', null, k.eposta), h('td', null, k.rol === 'yonetici' ? 'Yönetici' : 'Personel'),
        h('td', null, k.rol === 'yonetici' || !k.site_idler.length ? h('span', { class: 'soluk' }, 'Tüm siteler') : k.site_idler.map((id) => durum.siteler.find((x) => x.id === id)?.ad).filter(Boolean).join(', ')),
        h('td', null, rozet(k.aktif ? 'Aktif' : 'Pasif')),
        h('td', null, h('button', { class: 'dugme ikincil kucuk', onclick: () => kullaniciFormu(k) }, 'Düzenle'))))));
  } else {
    const l = await api('GET', '/api/islem-kaydi');
    govde = h('div', { class: 'kart' }, tablo(['Zaman', 'Kullanıcı', 'İşlem', 'Açıklama'], l.map((x) => h('tr', null,
      h('td', null, new Date(x.zaman).toLocaleString('tr-TR')), h('td', null, x.kullanici || 'Sistem'), h('td', null, x.tur), h('td', null, x.aciklama)))));
  }
  icerik.replaceChildren(ust('Ayarlar'), sekmeler, govde);
}
function kullaniciFormu(k = null) {
  basitForm(k ? `Kullanıcı · ${k.ad_soyad}` : 'Yeni kullanıcı', [
    k ? null : alan('Ad soyad', metinGirdi('ad_soyad', { required: true }), true),
    k ? null : alan('E-posta', h('input', { type: 'email', name: 'eposta', required: true, autocomplete: 'off' }), true),
    alan('Rol', secimGirdi('rol', [['personel', 'Personel'], ['yonetici', 'Yönetici']], k?.rol || 'personel', {
      onchange: (e) => { const f = document.querySelector('#basit-form .site-kutular'); if (f) f.hidden = e.target.value === 'yonetici'; } })),
    alan(k ? 'Yeni parola (değişmeyecekse boş)' : 'Parola (en az 10 karakter)', h('input', { type: 'password', name: 'parola', autocomplete: 'new-password', required: !k })),
    cokSite() ? h('fieldset', { class: 'tam site-kutular', hidden: (k?.rol || 'personel') === 'yonetici' }, h('legend', null, 'Baktığı siteler (personel için; hiçbiri seçilmezse tüm siteler)'),
      durum.siteler.filter((x) => x.aktif).map((x) => h('label', { class: 'kutucuk' }, h('input', { type: 'checkbox', 'data-site': x.id, checked: k?.site_idler?.includes(x.id) }), x.ad))) : null,
    k ? h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'aktif', checked: k.aktif }), 'Aktif') : null,
  ], async (v) => {
    if (cokSite() && v.rol !== 'yonetici') v.site_idler = [...document.querySelectorAll('#basit-form [data-site]')].filter((x) => x.checked).map((x) => Number(x.dataset.site));
    if (k) await api('PUT', `/api/kullanicilar/${k.id}`, v); else await api('POST', '/api/kullanicilar', v); bildir('Kaydedildi.');
  });
}
function siteFormu(x = null) {
  basitForm(x ? `Site · ${x.ad}` : 'Yeni site', [
    alan('Site adı', metinGirdi('ad', { value: x?.ad, required: true, maxlength: 120 }), true),
    alan('Adres', metinGirdi('adres', { value: x?.adres, maxlength: 500 }), true),
    x ? h('label', { class: 'kutucuk tam' }, h('input', { type: 'checkbox', name: 'aktif', checked: x.aktif }), 'Aktif') : null,
  ], async (v) => {
    if (x) await api('PUT', `/api/siteler/${x.id}`, v); else await api('POST', '/api/siteler', v);
    bildir('Site kaydedildi.'); await siteleriYukle(); yerlesim();
  });
}

// ---------- Başlangıç ----------
async function basla() {
  try { durum.ben = await api('GET', '/api/ben'); } catch { if (location.hash.startsWith('#/kayit')) kayitEkrani(); return; }
  if (durum.ben.deneme_bitti) { denemeBittiEkrani(); return; }
  durum.ayarlar = await api('GET', '/api/ayarlar').catch(() => null);
  await siteleriYukle();
  yerlesim();
  yonlendir();
}
window.addEventListener('hashchange', yonlendir);
basla();

// =====================================================================
// ---------- Aidat (site yönetimi) ----------
// =====================================================================
const kiraAcik = () => !!durum.ayarlar?.kira_modulu;
const GIDER_KATEGORILERI = ['Elektrik', 'Su', 'Doğalgaz', 'Temizlik', 'Güvenlik', 'Bakım-Onarım', 'Asansör', 'Bahçe', 'Personel', 'Sigorta',
  'Yönetim Ücreti', 'Kırtasiye', 'Banka Masrafı', 'Diğer'];
const kpiKutu = (ad, deger, renk, alt) => h('div', { class: 'kpi ' + renk }, h('div', { class: 'ad' }, ad), h('div', { class: 'deger' }, deger), alt ? h('div', { class: 'soluk' }, alt) : null);
const siteAdi = () => (durum.siteId ? durum.siteler.find((x) => x.id === durum.siteId)?.ad : null);
const tekSiteId = () => durum.siteId || (durum.siteler.filter((x) => x.aktif).length === 1 ? durum.siteler.find((x) => x.aktif).id : null);

// Panel: bu ayın aidatı, borçlular, kasa; daireler aidat durumuna göre renklenir.
async function aidatPanelSayfasi(icerik) {
  const [o, daireler, acik] = await Promise.all([
    api('GET', '/api/aidat/ozet' + siteP('?')), api('GET', '/api/daireler' + siteP('?')), api('GET', '/api/aidat/borclar?durum=Açık' + siteP())]);
  const borc = new Map();
  for (const b of acik) {
    const x = borc.get(b.daire_id) || { kalan: 0, geciken: 0, gun: 0 };
    x.kalan += b.kalan; if (b.durum === 'Gecikti') { x.geciken += b.kalan; x.gun = Math.max(x.gun, b.gecikme_gun); }
    borc.set(b.daire_id, x);
  }
  const aktif = daireler.filter((d) => d.aktif);
  const kartlar = aktif.map((d) => {
    const x = borc.get(d.id) || { kalan: 0, geciken: 0, gun: 0 };
    const oturan = d.ad_soyad || (d.ev_sahibi_oturuyor ? d.ev_sahibi_ad : null);
    const sinif = x.geciken > 0 ? 'gecikti' : x.kalan > 0 ? 'acik' : 'temiz';
    return h('button', { class: 'daire-kart ' + sinif, type: 'button', onclick: () => daireHesabi(d.id) },
      h('span', { class: 'no' }, daireAdi(d)),
      h('span', { class: 'kiraci' }, oturan || (d.ev_sahibi_ad ? `Malik: ${d.ev_sahibi_ad}` : 'Boş daire')),
      h('span', { class: 'soluk' }, d.sozlesme_id ? 'Kiracı oturuyor' : d.ev_sahibi_oturuyor ? 'Malik oturuyor' : 'Boş'),
      h('span', { class: 'alt-satir' },
        x.geciken > 0 ? h('span', { class: 'rozet turuncu' }, `${x.gun} gün gecikti`) : x.kalan > 0 ? h('span', { class: 'rozet mavi' }, 'Ödeme bekliyor') : rozet('Ödendi'),
        x.kalan > 0 ? h('b', { class: 'kalan' }, para(x.kalan)) : null));
  });
  icerik.replaceChildren(
    ust('Panel', `${siteAdi() ? siteAdi() + ' · ' : cokSite() ? `${durum.siteler.filter((x) => x.aktif).length} site · ` : ''}${donemTR(o.donem)} · ${o.daire} daire (${o.daire_malik} malik, ${o.daire_kiraci} kiracı, ${o.daire_bos} boş)`,
      h('button', { class: 'dugme ikincil', onclick: () => giderFormu() }, '+ Gider'),
      h('button', { class: 'dugme', onclick: () => aidatOdemeFormu() }, '+ Ödeme al')),
    h('div', { class: 'kpi-sira' },
      kpiKutu('Bu ay borçlandırılan', para(o.bu_ay_beklenen), 'komur', 'aidat ve ek toplama'),
      kpiKutu('Tahsil edilen', para(o.bu_ay_odenen), 'mavi', `%${o.tahsil_orani.toLocaleString('tr-TR')}`),
      kpiKutu('Bu ay kalan', para(o.bu_ay_kalan), 'mavi'),
      kpiKutu('Geciken', para(o.geciken_toplam), 'turuncu', `${o.borclu_daire} daire · tazminat ${para(o.tazminat_toplam)}`),
      kpiKutu('Kasa', para(o.kasa), 'komur', `bu ay gider ${para(o.bu_ay_gider)}`)),
    h('div', { class: 'kart' },
      h('div', { class: 'kart-baslik' }, h('h2', null, 'Daireler'),
        h('div', { class: 'takvim-lejant' }, h('span', null, h('i', { class: 'l-dolu' }), 'Ödendi'), h('span', null, h('i', { class: 'l-kismi' }), 'Ödeme bekliyor'), h('span', null, h('i', { class: 'l-bugun' }), 'Gecikti'))),
      kartlar.length ? (cokSite() && !durum.siteId ? siteGruplari(aktif, kartlar) : h('div', { class: 'daire-izgara' }, kartlar))
        : h('div', { class: 'bos-liste' }, 'Henüz daire yok. ', yonetici() ? 'Daireler sayfasından ekleyin, sonra Aidat Planı\'ndan aidatı belirleyin.' : '')));
}

// Dairenin aidat cari hesabı.
async function daireHesabi(id) {
  const d = await api('GET', `/api/aidat/daire/${id}`);
  const yenidenAc = () => { kapat(); daireHesabi(id); };
  const kisiSatir = (ad, kisi, tel) => (kisi ? h('div', null, h('small', { class: 'soluk' }, ad), h('b', null, kisi), tel ? h('div', { class: 'soluk' }, tel) : null) : null);
  const govde = h('div', null,
    h('div', { class: 'detay-ust' },
      kisiSatir('Kat maliki', d.malik, d.malik_telefon) || h('div', null, h('small', { class: 'soluk' }, 'Kat maliki'), h('span', { class: 'soluk' }, 'girilmemiş')),
      kisiSatir('Kiracı', d.kiraci, d.kiraci_telefon),
      h('div', null, h('small', { class: 'soluk' }, 'Bilgi'), h('span', null, [d.tip, d.metrekare ? `${d.metrekare} m²` : null, d.arsa_payi ? `arsa payı ${d.arsa_payi}` : null].filter(Boolean).join(' · ')))),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Borç bakiyesi'), h('b', { class: d.bakiye > 0 ? 'kalan' : '' }, para(d.bakiye))),
      h('div', null, h('small', null, 'Avans'), h('b', null, para(d.avans))),
      h('div', null, h('small', null, 'Gecikme tazminatı (hesaplanan)'), h('b', null, para(d.tazminat)))),
    h('h3', null, 'Borçlar'),
    tablo(['Dönem', 'Tür', 'Vade', ['Tutar', 'sayi'], ['Ödenen', 'sayi'], ['Kalan', 'sayi'], 'Durum', ''],
      d.borclar.map((b) => h('tr', null, h('td', null, donemTR(b.donem)), h('td', null, b.tur === 'Aidat' ? 'Aidat' : b.aciklama), h('td', null, tarihTR(b.vade)),
        h('td', { class: 'sayi' }, para(b.tutar)), h('td', { class: 'sayi' }, para(b.odenen)), h('td', { class: 'sayi' + (b.kalan > 0 ? ' kalan' : '') }, para(b.kalan)),
        h('td', null, rozet(b.durum), b.tazminat > 0 ? h('div', { class: 'soluk' }, `tazminat ${para(b.tazminat)}`) : null),
        h('td', null, yonetici() && b.odenen === 0 ? h('button', { class: 'dugme ikincil kucuk', onclick: () => aidatBorcIptal(b, yenidenAc) }, 'İptal') : null))), 'Borç yok.'),
    h('h3', null, 'Ödemeler'),
    tablo(['Makbuz', 'Tarih', 'Ödeyen', 'Tür', ['Tutar', 'sayi'], ''],
      d.tahsilatlar.map((t) => h('tr', { class: t.iptal ? 'iptal' : '' }, h('td', null, `#${t.makbuz_no}`), h('td', null, tarihTR(t.tarih)), h('td', null, t.odeyen || ''),
        h('td', null, t.odeme_turu, t.kaynak === 'Banka' ? h('span', { class: 'soluk' }, ' (banka)') : null), h('td', { class: 'sayi' }, para(t.tutar)),
        h('td', null, h('button', { class: 'dugme ikincil kucuk', onclick: () => makbuzGoster(t.id) }, 'Makbuz'),
          ' ', yonetici() && !t.iptal ? h('button', { class: 'dugme ikincil kucuk', onclick: () => aidatTahsilatIptal(t, yenidenAc) }, 'İptal') : null))), 'Ödeme yok.'));
  const kapat = pencere(`${d.site} · ${daireAdi(d)}`, govde, [
    yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => { kapat(); api('GET', '/api/daireler').then((l) => daireFormu(l.find((x) => x.id === d.id))); } }, 'Daireyi düzenle') : null,
    h('button', { class: 'dugme', onclick: () => { kapat(); aidatOdemeFormu(d); } }, '+ Ödeme al')].filter(Boolean), { genis: true });
}

async function aidatOdemeFormu(d = null) {
  let liste;
  if (d) liste = [d];
  else {
    const [daireler, acik] = await Promise.all([api('GET', '/api/daireler' + siteP('?')), api('GET', '/api/aidat/borclar?durum=Açık' + siteP())]);
    const kalan = new Map(); for (const b of acik) kalan.set(b.daire_id, (kalan.get(b.daire_id) || 0) + b.kalan);
    liste = daireler.filter((x) => x.aktif).map((x) => ({ ...x, bakiye: kalan.get(x.id) || 0, kiraci: x.ad_soyad, malik: x.ev_sahibi_ad }));
  }
  if (!liste.length) { bildir('Daire yok.', true); return; }
  const odeyenG = metinGirdi('odeyen', { maxlength: 120, value: liste[0].kiraci || liste[0].malik || '' });
  const tutarG = tutarGirdi('tutar', { required: true, value: liste[0].bakiye > 0 ? liste[0].bakiye : undefined });
  const daireG = secimGirdi('daire_id', liste.map((x) => [x.id, `${adi(x)}${x.bakiye > 0 ? ` · borç ${para(x.bakiye)}` : ''}`]), d?.id, {
    onchange: (e) => { const x = liste.find((y) => String(y.id) === e.target.value); odeyenG.value = x?.kiraci || x?.malik || ''; tutarG.value = x?.bakiye > 0 ? String(x.bakiye).replace('.', ',') : ''; } });
  let yeniId = null;
  basitForm(d ? `Aidat ödemesi · ${daireAdi(d)}` : 'Aidat ödemesi al', [
    alan('Daire', daireG, true),
    alan('Tutar', tutarG),
    alan('Tarih', tarihGirdi('tarih', { value: bugun(), required: true, max: bugun() })),
    alan('Ödeme türü', secimGirdi('odeme_turu', ODEME_TURLERI, 'Nakit')),
    alan('Ödeyen', odeyenG),
    alan('Açıklama', metinGirdi('aciklama', { maxlength: 500 }), true),
    h('p', { class: 'tam soluk' }, 'Ödeme en eski borçtan başlayarak düşer; fazlası sonraki aylara avans olarak geçer. Kaydedince makbuz açılır.'),
  ], async (v) => { v.daire_id = Number(v.daire_id); const r = await api('POST', '/api/aidat/tahsilatlar', v); yeniId = r.id; bildir(`Ödeme kaydedildi · makbuz #${r.makbuz_no}`); setTimeout(() => makbuzGoster(yeniId), 50); });
}

async function makbuzGoster(id) {
  const m = await api('GET', `/api/aidat/makbuz/${id}`);
  const govde = h('div', { class: 'makbuz' },
    h('div', { class: 'makbuz-ust' },
      h('div', null, h('b', null, m.firma), h('div', { class: 'soluk' }, `${m.site}${m.site_adres ? ' · ' + m.site_adres : ''}`)),
      h('div', { class: 'makbuz-no' }, h('small', null, 'TAHSİLAT MAKBUZU'), h('b', null, `No ${m.makbuz_no}`), h('div', null, tarihTR(m.tarih)))),
    m.iptal ? h('div', { class: 'makbuz-iptal' }, `İPTAL EDİLDİ · ${m.iptal_nedeni || ''}`) : null,
    h('dl', { class: 'makbuz-bilgi' },
      h('dt', null, 'Daire'), h('dd', null, daireAdi(m)),
      h('dt', null, 'Ödeyen'), h('dd', null, m.odeyen || '—'),
      h('dt', null, 'Ödeme türü'), h('dd', null, m.odeme_turu),
      m.aciklama ? h('dt', null, 'Açıklama') : null, m.aciklama ? h('dd', null, m.aciklama) : null),
    tablo(['Kalem', ['Tutar', 'sayi']], [
      ...m.kalemler.map((k) => h('tr', null, h('td', null, k.tur === 'Aidat' ? `${donemTR(k.donem)} aidatı` : k.aciklama), h('td', { class: 'sayi' }, para(k.tutar)))),
      m.avans > 0 ? h('tr', null, h('td', null, 'Avans (sonraki aylara)'), h('td', { class: 'sayi' }, para(m.avans))) : null,
      h('tr', { class: 'toplam' }, h('td', null, h('b', null, 'Toplam')), h('td', { class: 'sayi' }, h('b', null, para(m.tutar)))),
    ].filter(Boolean)),
    h('p', { class: 'makbuz-yazi' }, m.yaziyla),
    h('div', { class: 'makbuz-imza' }, h('span', null, 'Teslim eden'), h('span', null, 'Teslim alan')));
  const kapat = pencere(`Makbuz #${m.makbuz_no}`, govde, [
    h('button', { class: 'dugme ikincil', onclick: () => kapat() }, 'Kapat'),
    h('button', { class: 'dugme', onclick: () => { document.body.classList.add('makbuz-yazdir'); window.print(); document.body.classList.remove('makbuz-yazdir'); } }, 'Yazdır / PDF')]);
}

function aidatTahsilatIptal(t, sonra) {
  const neden = prompt(`Makbuz #${t.makbuz_no} · ${para(t.tutar)} iptal edilsin mi? Nedeni yazın:`);
  if (!neden) return;
  api('POST', `/api/aidat/tahsilatlar/${t.id}/iptal`, { neden }).then(() => { bildir('Ödeme iptal edildi; kalan ödemeler yeniden dağıtıldı.'); sonra(); }).catch((e) => bildir(e.message, true));
}
function aidatBorcIptal(b, sonra) {
  const neden = prompt(`${donemTR(b.donem)} ${b.tur.toLowerCase()} borcu (${para(b.tutar)}) iptal edilsin mi? Nedeni yazın:`);
  if (!neden) return;
  api('POST', `/api/aidat/borclar/${b.id}/iptal`, { neden }).then(() => { bildir('Borç iptal edildi.'); sonra(); }).catch((e) => bildir(e.message, true));
}

// Aidat takibi: dönemin borçları.
async function aidatTakibiSayfasi(icerik) {
  const q = sorgu();
  const donem = q.get('donem') || buAy();
  const d = q.get('durum') || '';
  const l = await api('GET', `/api/aidat/borclar?donem=${donem}${d ? '&durum=' + encodeURIComponent(d) : ''}${siteP()}`);
  const git = (deg) => { location.hash = '#/aidat?' + new URLSearchParams({ donem, durum: d, ...deg }); };
  const t = l.reduce((a, b) => ({ tutar: a.tutar + b.tutar, odenen: a.odenen + b.odenen, kalan: a.kalan + b.kalan, tazminat: a.tazminat + b.tazminat }), { tutar: 0, odenen: 0, kalan: 0, tazminat: 0 });
  icerik.replaceChildren(
    ust('Aidat Takibi', `${donemTR(donem)} · ${l.length} kayıt`,
      h('button', { class: 'dugme ikincil', onclick: () => git({ donem: ayKaydir(donem, -1) }) }, '‹'),
      h('input', { type: 'month', class: 'secim', value: donem, onchange: (e) => e.target.value && git({ donem: e.target.value }) }),
      h('button', { class: 'dugme ikincil', onclick: () => git({ donem: ayKaydir(donem, 1) }) }, '›'),
      h('select', { class: 'secim', onchange: (e) => git({ durum: e.target.value }) },
        [['', 'Hepsi'], ['Açık', 'Ödenmemiş'], ['Gecikti', 'Gecikenler'], ['Kısmi Ödendi', 'Kısmi'], ['Ödendi', 'Ödenenler']].map(([v, y]) => h('option', { value: v, selected: v === d }, y))),
      yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => api('POST', '/api/aidat/tahakkuk', { donem, ...(durum.siteId ? { site_id: durum.siteId } : {}) })
        .then((r) => { bildir(r.hatalar?.length ? r.hatalar.join(' · ') : r.olusan ? `${r.olusan} aidat borcu oluşturuldu.` : 'Bu dönemin aidatları zaten oluşmuş (ya da aidat planı yok).', !!r.hatalar?.length); yenile(); })
        .catch((e) => bildir(e.message, true)) }, 'Bu dönemin aidatını oluştur') : null,
      yonetici() ? h('button', { class: 'dugme ikincil', onclick: () => ekToplamaFormu() }, '+ Ek toplama') : null,
      h('button', { class: 'dugme', onclick: () => aidatOdemeFormu() }, '+ Ödeme al')),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Beklenen'), h('b', null, para(t.tutar))),
      h('div', null, h('small', null, 'Tahsil edilen'), h('b', null, para(t.odenen))),
      h('div', null, h('small', null, 'Kalan'), h('b', { class: t.kalan > 0 ? 'kalan' : '' }, para(t.kalan))),
      h('div', null, h('small', null, 'Gecikme tazminatı'), h('b', null, para(t.tazminat)))),
    h('div', { class: 'kart' }, tablo(['Daire', 'Tür', 'Vade', ['Tutar', 'sayi'], ['Ödenen', 'sayi'], ['Kalan', 'sayi'], 'Son ödeme', 'Durum', ''],
      l.map((b) => h('tr', null,
        h('td', null, h('b', null, adi(b))), h('td', null, b.tur === 'Aidat' ? 'Aidat' : b.aciklama), h('td', null, tarihTR(b.vade)),
        h('td', { class: 'sayi' }, para(b.tutar)), h('td', { class: 'sayi' }, para(b.odenen)), h('td', { class: 'sayi' + (b.kalan > 0 ? ' kalan' : '') }, para(b.kalan)),
        h('td', null, tarihTR(b.son_odeme)),
        h('td', null, rozet(b.durum), b.durum === 'Gecikti' ? h('span', { class: 'soluk' }, ` ${b.gecikme_gun} gün`) : b.yaklasan ? h('span', { class: 'soluk' }, ' yaklaşıyor') : null),
        h('td', null, b.kalan > 0 ? h('button', { class: 'dugme turuncu kucuk', onclick: () => api('GET', `/api/aidat/daire/${b.daire_id}`).then(aidatOdemeFormu) }, 'Ödeme al') : null,
          ' ', h('button', { class: 'dugme ikincil kucuk', onclick: () => daireHesabi(b.daire_id) }, 'Hesap')))),
      `${donemTR(donem)} için aidat borcu yok. ${yonetici() ? 'Aidat Planı\'nı kaydedip "Bu dönemin aidatını oluştur"a basın.' : ''}`)));
}

// Borçlular: geciken daireler, tazminat ve hazır hatırlatma.
async function borclularSayfasi(icerik) {
  const l = await api('GET', '/api/aidat/borclular' + siteP('?'));
  const toplam = l.reduce((a, g) => a + g.geciken_tutar, 0);
  const tazminat = l.reduce((a, g) => a + g.tazminat, 0);
  icerik.replaceChildren(
    ust('Borçlular', `${l.length} daire · geciken ${para(toplam)} · hesaplanan tazminat ${para(tazminat)}`),
    h('div', { class: 'kart' }, l.length ? l.map((g) => h('div', { class: 'geciken-kart' },
      h('div', null,
        h('h3', null, `${adi(g)} · ${g.muhatap || 'Malik/oturan girilmemiş'}`, g.kiraci && g.malik ? h('span', { class: 'soluk' }, ` (malik: ${g.malik})`) : null),
        h('div', { class: 'soluk' }, `${[...new Set(g.donemler)].map(donemTR).join(', ')} · ${g.gecikme_gun} gün gecikme · son ödeme ${g.son_odeme ? tarihTR(g.son_odeme) : 'yok'}`),
        h('div', { class: 'sms-kutu' }, g.mesaj)),
      h('div', null,
        h('div', { class: 'tutar' }, para(g.geciken_tutar)),
        g.tazminat > 0 ? h('div', { class: 'soluk' }, `+ tazminat ${para(g.tazminat)}`) : null,
        h('div', { class: 'araclar' },
          h('button', { class: 'dugme ikincil kucuk', onclick: () => navigator.clipboard.writeText(g.mesaj).then(() => bildir('Mesaj kopyalandı.'), () => bildir('Kopyalanamadı.', true)) }, 'Mesajı kopyala'),
          g.whatsapp ? h('a', { class: 'dugme ikincil kucuk', href: g.whatsapp, target: '_blank', rel: 'noopener' }, 'WhatsApp') : null,
          h('button', { class: 'dugme ikincil kucuk', onclick: () => daireHesabi(g.daire_id) }, 'Hesap'),
          h('button', { class: 'dugme turuncu kucuk', onclick: () => api('GET', `/api/aidat/daire/${g.daire_id}`).then(aidatOdemeFormu) }, 'Ödeme al'))))) : h('div', { class: 'bos-liste' }, 'Geciken aidat yok. 👍')));
}

// Giderler.
async function giderlerSayfasi(icerik) {
  const q = sorgu();
  const ay = q.get('ay') || buAy();
  const bas = `${ay}-01`; const bit = `${ayKaydir(ay, 1)}-01`;
  const l = (await api('GET', `/api/giderler?baslangic=${bas}${siteP()}`)).filter((g) => g.tarih < bit);
  const git = (a) => { location.hash = '#/giderler?ay=' + a; };
  const toplam = l.filter((g) => !g.iptal).reduce((a, g) => a + g.tutar, 0);
  icerik.replaceChildren(
    ust('Giderler', `${donemTR(ay)} · ${l.length} kayıt · toplam ${para(toplam)}`,
      h('button', { class: 'dugme ikincil', onclick: () => git(ayKaydir(ay, -1)) }, '‹'),
      h('input', { type: 'month', class: 'secim', value: ay, onchange: (e) => e.target.value && git(e.target.value) }),
      h('button', { class: 'dugme ikincil', onclick: () => git(ayKaydir(ay, 1)) }, '›'),
      h('button', { class: 'dugme', onclick: () => giderFormu() }, '+ Gider')),
    h('div', { class: 'kart' }, tablo(['Tarih', cokSite() && !durum.siteId ? 'Site' : null, 'Kategori', 'Açıklama', 'Belge', 'Ödeme', ['Tutar', 'sayi'], ''].filter(Boolean),
      l.map((g) => h('tr', { class: g.iptal ? 'iptal' : '' }, h('td', null, tarihTR(g.tarih)), cokSite() && !durum.siteId ? h('td', null, g.site) : null,
        h('td', null, g.kategori), h('td', null, g.aciklama || '', g.iptal ? h('div', { class: 'soluk' }, `İptal: ${g.iptal_nedeni}`) : null), h('td', null, g.belge_no || ''), h('td', null, g.odeme_turu),
        h('td', { class: 'sayi' }, para(g.tutar)),
        h('td', null, yonetici() && !g.iptal ? h('button', { class: 'dugme ikincil kucuk', onclick: () => {
          const neden = prompt(`${g.kategori} · ${para(g.tutar)} gideri iptal edilsin mi? Nedeni:`);
          if (neden) api('POST', `/api/giderler/${g.id}/iptal`, { neden }).then(() => { bildir('Gider iptal edildi.'); yenile(); }).catch((e) => bildir(e.message, true));
        } }, 'İptal') : null))), `${donemTR(ay)} için gider yok.`)));
}
function giderFormu() {
  const siteler = durum.siteler.filter((x) => x.aktif);
  if (!siteler.length) { bildir('Önce bir site ekleyin.', true); return; }
  basitForm('Yeni gider', [
    siteler.length > 1 ? alan('Site', secimGirdi('site_id', siteler.map((x) => [x.id, x.ad]), tekSiteId() ?? siteler[0].id), true) : null,
    alan('Tarih', tarihGirdi('tarih', { value: bugun(), required: true })),
    alan('Kategori', h('span', null, metinGirdi('kategori', { required: true, list: 'gider-kategori', maxlength: 60, placeholder: 'ör. Elektrik' }),
      h('datalist', { id: 'gider-kategori' }, GIDER_KATEGORILERI.map((k) => h('option', { value: k }))))),
    alan('Tutar', tutarGirdi('tutar', { required: true })),
    alan('Ödeme türü', secimGirdi('odeme_turu', ODEME_TURLERI, 'Havale/EFT')),
    alan('Belge / fatura no', metinGirdi('belge_no', { maxlength: 60 })),
    alan('Açıklama', metinGirdi('aciklama', { maxlength: 500 }), true),
  ], async (v) => { v.site_id = Number(v.site_id || siteler[0].id); await api('POST', '/api/giderler', v); bildir('Gider kaydedildi.'); });
}

// Gelir-gider ve kasa.
async function gelirGiderSayfasi(icerik) {
  const q = sorgu();
  const bas = q.get('baslangic') || `${bugun().slice(0, 4)}-01-01`;
  const bit = q.get('bitis') || bugun();
  const r = await api('GET', `/api/gelir-gider?baslangic=${bas}&bitis=${bit}${siteP()}`);
  const basG = tarihGirdi('b', { class: 'secim', value: bas }); const bitG = tarihGirdi('s', { class: 'secim', value: bit });
  icerik.replaceChildren(
    ust('Gelir-Gider', `${tarihTR(bas)} – ${tarihTR(bit)}`, basG, bitG,
      h('button', { class: 'dugme ikincil', onclick: () => { location.hash = '#/gelir-gider?' + new URLSearchParams({ baslangic: basG.value, bitis: bitG.value }); } }, 'Göster'),
      h('button', { class: 'dugme', onclick: () => window.print() }, 'Yazdır / PDF')),
    h('div', { class: 'ozet-kutular' },
      h('div', null, h('small', null, 'Aidat geliri'), h('b', null, para(r.toplam.gelir))),
      h('div', null, h('small', null, 'Gider'), h('b', null, para(r.toplam.gider))),
      h('div', null, h('small', null, 'Fark'), h('b', { class: r.toplam.fark < 0 ? 'kalan' : '' }, para(r.toplam.fark))),
      h('div', null, h('small', null, `Kasa (${tarihTR(bit)})`), h('b', null, para(r.toplam.kasa)))),
    h('div', { class: 'kart' }, h('h2', null, 'Siteler'), tablo(['Site', ['Gelir', 'sayi'], ['Gider', 'sayi'], ['Fark', 'sayi'], ['Kasa', 'sayi']],
      r.siteler.map((s) => h('tr', null, h('td', null, h('b', null, s.site)), h('td', { class: 'sayi' }, para(s.gelir)), h('td', { class: 'sayi' }, para(s.gider)),
        h('td', { class: 'sayi' + (s.fark < 0 ? ' kalan' : '') }, para(s.fark)), h('td', { class: 'sayi' }, para(s.kasa)))))),
    h('div', { class: 'kart' }, h('h2', null, 'Gider kalemleri'), tablo(['Kategori', ['Tutar', 'sayi'], ['Pay', 'sayi']],
      r.kategoriler.map((k) => h('tr', null, h('td', null, k.kategori), h('td', { class: 'sayi' }, para(k.tutar)),
        h('td', { class: 'sayi' }, r.toplam.gider > 0 ? `%${(Math.round((k.tutar / r.toplam.gider) * 1000) / 10).toLocaleString('tr-TR')}` : ''))), 'Bu aralıkta gider yok.')));
}

// Aidat planı (işletme projesi) ve dairelerin arsa payı / özel aidatı; ek toplamalar.
async function aidatPlaniSayfasi(icerik) {
  const siteler = durum.siteler.filter((x) => x.aktif);
  if (!siteler.length) { icerik.replaceChildren(ust('Aidat Planı'), h('div', { class: 'kart bos-liste' }, 'Önce Ayarlar > Siteler\'den bir site ekleyin.')); return; }
  const siteId = Number(sorgu().get('site')) || tekSiteId() || siteler[0].id;
  const [p, ekler] = await Promise.all([api('GET', `/api/aidat/plan/${siteId}`), api('GET', `/api/aidat/ek-toplamalar?site_id=${siteId}`)]);
  const hataEl = h('div', { class: 'hata-yazi' });
  const dugme = h('button', { class: 'dugme', type: 'submit' }, 'Planı kaydet');
  const yontemG = secimGirdi('aidat_yontemi', [['Sabit', 'Her daireye aynı tutar'], ['Arsa payı', 'Bütçe arsa payına göre'], ['Metrekare', 'Bütçe metrekareye göre'], ['Eşit', 'Bütçe dairelere eşit']], p.aidat_yontemi,
    { onchange: (e) => { tutarEt.firstChild.textContent = e.target.value === 'Sabit' ? 'Daire başı aylık aidat' : 'Aylık toplam bütçe'; } });
  const tutarEt = alan(p.aidat_yontemi === 'Sabit' ? 'Daire başı aylık aidat' : 'Aylık toplam bütçe', tutarGirdi('aidat_tutari', { value: p.aidat_tutari, required: true }));
  const form = h('form', { onsubmit: (e) => { e.preventDefault(); gonder(dugme, hataEl, async () => { await api('PUT', `/api/aidat/plan/${siteId}`, formVerisi(form)); bildir('Aidat planı kaydedildi.'); yenile(); }); } },
    h('div', { class: 'form' },
      alan('Paylaştırma', yontemG, true), tutarEt,
      alan('Son ödeme günü (her ay)', h('input', { type: 'number', name: 'aidat_gunu', min: 1, max: 28, value: p.aidat_gunu, 'data-tur': 'sayi' })),
      alan('Başlangıç dönemi', h('input', { type: 'month', name: 'aidat_baslangic', value: p.aidat_baslangic || buAy() })),
      alan('Gecikme tazminatı (aylık %, en çok 5)', tutarGirdi('gecikme_orani', { value: p.gecikme_orani })),
      alan('Yönetim hesabı IBAN (hatırlatma ve makbuzda)', metinGirdi('iban', { value: p.iban, maxlength: 40, placeholder: 'TR..' }), true),
      h('div', { class: 'tam' }, hataEl, dugme)));
  const satirlar = p.daireler.map((d) => {
    const arsa = tutarGirdi('arsa', { value: d.arsa_payi, placeholder: '' }); const ozel = tutarGirdi('ozel', { value: d.aidat_ozel, placeholder: 'plana göre' });
    arsa.dataset.daire = d.id; ozel.dataset.daire = d.id;
    return h('tr', null, h('td', null, h('b', null, daireAdi(d))), h('td', { class: 'sayi' }, d.metrekare || ''), h('td', null, arsa), h('td', null, ozel),
      h('td', { class: 'sayi' }, d.aylik_aidat ? para(d.aylik_aidat) : '—'));
  });
  const tablo2 = tablo(['Daire', ['m²', 'sayi'], 'Arsa payı', 'Özel aidat', ['Aylık aidat', 'sayi']], satirlar, 'Sitede daire yok.');
  const daireKaydet = h('button', { class: 'dugme ikincil', onclick: async () => {
    daireKaydet.disabled = true;
    try {
      for (const d of p.daireler) {
        const oku = (ad) => { const el = tablo2.querySelector(`input[name=${ad}][data-daire="${d.id}"]`); const t = el.value.trim(); return t === '' ? null : Number(t.replace(/\./g, '').replace(',', '.')); };
        const arsa = oku('arsa'); const ozel = oku('ozel');
        if (arsa !== (d.arsa_payi ?? null) || ozel !== (d.aidat_ozel ?? null)) await api('PUT', `/api/aidat/daire/${d.id}`, { arsa_payi: arsa, aidat_ozel: ozel });
      }
      bildir('Daire bilgileri kaydedildi.'); yenile();
    } catch (e) { bildir(e.message, true); daireKaydet.disabled = false; }
  } }, 'Daire bilgilerini kaydet');
  icerik.replaceChildren(
    ust('Aidat Planı', `${p.ad} · ${p.daireler.length} daire${p.aylik_toplam ? ` · aylık toplam ${para(p.aylik_toplam)}` : ''}`,
      siteler.length > 1 ? h('select', { class: 'secim', onchange: (e) => { location.hash = '#/aidat-plani?site=' + e.target.value; } }, siteler.map((x) => h('option', { value: x.id, selected: x.id === siteId }, x.ad))) : null),
    h('div', { class: 'kart' }, h('h2', null, 'Plan'),
      h('p', { class: 'soluk' }, 'Her ayın aidatı bu plana göre dairelere kendiliğinden yazılır. Özel aidat girilen daire o tutarı öder, bütçenin kalanı diğer dairelere bölünür. Gecikme tazminatı Kat Mülkiyeti Kanunu\'na göre aylık %5\'i geçemez.'),
      p.hata ? h('p', { class: 'hata-yazi' }, p.hata) : null, form),
    h('div', { class: 'kart' }, h('div', { class: 'kart-baslik' }, h('h2', null, 'Daireler'), daireKaydet), tablo2),
    h('div', { class: 'kart' }, h('div', { class: 'kart-baslik' }, h('div', null, h('h2', null, 'Ek toplamalar'), h('p', { class: 'soluk' }, 'Demirbaş, onarım, boya gibi tek seferlik giderin dairelere paylaştırılması.')),
      h('button', { class: 'dugme kucuk', onclick: () => ekToplamaFormu(siteId) }, '+ Ek toplama')),
      tablo(['Son ödeme', 'Açıklama', 'Paylaştırma', ['Toplam', 'sayi'], ['Tahsil edilen', 'sayi'], ''], ekler.map((e) => h('tr', { class: e.iptal ? 'iptal' : '' },
        h('td', null, tarihTR(e.vade)), h('td', null, e.aciklama), h('td', null, e.yontem), h('td', { class: 'sayi' }, para(e.toplam)), h('td', { class: 'sayi' }, para(e.tahsil_edilen)),
        h('td', null, !e.iptal ? h('button', { class: 'dugme ikincil kucuk', onclick: () => {
          const neden = prompt(`"${e.aciklama}" ek toplaması iptal edilsin mi? Dairelere yazılan borçlar silinir. Nedeni:`);
          if (neden) api('POST', `/api/aidat/ek-toplamalar/${e.id}/iptal`, { neden }).then(() => { bildir('Ek toplama iptal edildi.'); yenile(); }).catch((x) => bildir(x.message, true));
        } }, 'İptal') : null))), 'Ek toplama yok.')));
}
function ekToplamaFormu(siteId = null) {
  const siteler = durum.siteler.filter((x) => x.aktif);
  basitForm('Ek toplama', [
    siteler.length > 1 ? alan('Site', secimGirdi('site_id', siteler.map((x) => [x.id, x.ad]), siteId ?? tekSiteId() ?? siteler[0].id), true) : null,
    alan('Açıklama', metinGirdi('aciklama', { required: true, maxlength: 300, placeholder: 'ör. Çatı onarımı' }), true),
    alan('Toplam tutar', tutarGirdi('toplam', { required: true })),
    alan('Paylaştırma', secimGirdi('yontem', [['Arsa payı', 'Arsa payına göre'], ['Metrekare', 'Metrekareye göre'], ['Eşit', 'Dairelere eşit']], 'Arsa payı')),
    alan('Son ödeme tarihi', tarihGirdi('vade', { required: true, value: `${buAy()}-28` })),
    h('p', { class: 'tam soluk' }, 'Toplam tutar sitedeki aktif dairelere paylaştırılır ve her dairenin hesabına ayrı borç olarak yazılır.'),
  ], async (v) => { v.site_id = Number(v.site_id || siteId || siteler[0].id); const r = await api('POST', '/api/aidat/ek-toplamalar', v); bildir(`Ek toplama ${r.daire_sayisi} daireye paylaştırıldı.`); });
}
