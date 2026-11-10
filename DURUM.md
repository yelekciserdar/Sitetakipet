# Durum ve yol haritası

## Sıradaki ve yarım kalan işler
- [ ] **Yeniden konumlandırma (9 Kasım, kullanıcı):** ürünü site yönetim/danışmanlık firmaları kullanacak; konu kira değil **aidat** (ve site giderleri). Ev sahibine aktarım/komisyon yok. Mevcut altyapı (daire, kişi, aylık tahakkuk, ödeme dağıtımı, banka eşleştirme, gecikenler, çoklu site, ev sahibi=malik) korunur; aidat planı, gider ve kasa, gecikme tazminatı, makbuz eklenecek. Ürün adı birlikte bulunacak (Claude seçenek sundu, 9 Kasım). **Kira takibi ayrı bir bölüm olarak kalır** (kullanıcı: isteyen kullanır) → firma ayarından açılıp kapanan modül.
- [ ] **Ev sahibi** (`claude/ev-sahibi` dalı, 9 Kasım): ev sahibi kartı ve Kiracılı/Ev sahibi/Boş durumu hazır; önizleme gösterildi, kullanıcı onayı bekleniyor.
- [x] **İlk sürüm** (9 Kasım, kullanıcı onayladı, PR #1): şema, kira ve banka kuralları, API, 18 test, arayüz, çoklu site ve site yetkisi, Docker/README.
- [x] **Arayüz renkleri (9 Kasım, kullanıcı kararı):** #F0F0F0 marshmallow beyazı (zemin), #105BFF (ana renk), #FE8500 (vurgu/uyarı). Yazılar okunurluk için koyu nötr gri. Yazı logo: "Kira" koyu, "Takip" #105BFF, "Et" #FE8500. 
- [ ] **Logo (9 Kasım):** ad SiteTakipEt. Kullanıcı seçimi: katlanmış kâğıt **ev başlı anahtar**, başın içinde sarı site blokları (tek ev değil; emlakçı çağrışımı azalsın diye). Renkler: kraliyet mavisi #105BFF zemin, beyaz anahtar, sarı #FFD100 bloklar; yazı "Site" koyu + "TakipEt" #105BFF. Turuncu yok. Kullanıcı onayladı (mavi zeminli simge); sırada uygulamaya, giriş ekranına, sekme simgesine ve tanıtım sayfasına konacak.
- [ ] Excel'den aktarım: müşterinin "Kira Takip" .xlsm dosyasındaki daire/kiracı/kira sayfalarını içe alma (müşteri isterse).
- [ ] Canlı kurulum: alan adı, sunucu, HTTPS, yedekleme; `VERI_ANAHTARI` (T.C. şifre anahtarı) güvenli saklanacak.
- [ ] Satış: fiyatlandırma, deneme süresi, firma açma akışı (şimdilik `npm run firma:olustur`).

- [ ] **Tanıtım sayfası** (`tanitim/`, 9 Kasım): mimari maket sayfası SiteTakipEt'e uyarlandı (aidat dili, yeni logo, turuncu yerine sarı); önizleme gösterildi, onay bekleniyor. Panel ekran görüntüsü aidat modülü bitince yenilenecek.
- [ ] **Canlıya alma (SiteTakipEt)** — betik hazır (`sunucu/kur.sh`, adımlar `sunucu/KURULUM.md`, 10 Kasım; bu oturumda deneme sunucusunda kurulum, nginx, yedek, güncelleme ve geri dönüş provası geçti). **10 Kasım kullanıcı sunucuda `kur`u çalıştırdı: KURULUM TAMAM** (ayrı PM2 `/opt/pm2-sitetakip`, program 127.0.0.1:3003, nginx HTTP, yedek ve Drive kopyası). VERI_ANAHTARI ekran görüntüsünde göründüğü için yenilendi (henüz T.C. verisi yoktu), yenisi kullanıcının Google Şifre Yöneticisi'nde. **10 Kasım: DNS (3 A kaydı), Let's Encrypt sertifikası (8 Şubat 2027'ye kadar, otomatik yenileme), turuncu bulut tamam; https://sitetakipet.com.tr ve https://panel.sitetakipet.com.tr Cloudflare üzerinden yayında.** Otomatik güncelleme bağlandı (10 Kasım, secret'lar girildi, deneme başarılı). Kalan: ilk firma. Eski plan: Cloudflare'de 3 A kaydı (gri) → `sertifika` → turuncu → `ci-anahtar` ve GitHub secret'ları. Plan:  sunucuda veritabanı ve kullanıcı, PM2 süreci, nginx (sitetakipet.com.tr → `tanitim/`, panel.sitetakipet.com.tr → program), Cloudflare DNS (önce gri bulut, sertifika, sonra turuncu), GitHub Actions ile otomatik güncelleme, yedeğe ekleme, `VERI_ANAHTARI` üretip Drive'a saklama, ilk firma. Kurulum betiğini Claude hazırlar, kullanıcı sunucuda çalıştırır. Satıştan önce aidat modülü bitmeli.

- [ ] **Aidat dönüşümü** (`claude/aidat` dalı, 10 Kasım; kullanıcı istedi: dışarıdan profesyonel yönetim yapan firmalara uygun): aidat planı (sabit / eşit / arsa payı / m², özel aidat), aylık otomatik aidat borcu, ek toplama, ödeme + makbuz (sıra no, yazıyla), daire cari hesabı, borçlular + KMK gecikme tazminatı (aylık %5'e kadar, hesaplanan) + WhatsApp hatırlatma, giderler, gelir-gider ve kasa, kira bölümü ayardan aç/kapa. 29 test. Önizleme gösterildi, onay bekleniyor. **Kalan:** banka ekstresinin aidata eşleşmesi (şimdilik kira bölümünde), aidat raporu Excel'e aktarma, sakin bilgilendirme (aylık hesap özeti), tanıtım sayfasındaki ekran görüntüsünün yenilenmesi.
- [ ] **Kendi kendine deneme kaydı** (`claude/deneme-kaydi`, 10 Kasım; kullanıcı: "Ücretsiz deneyin" iletişime değil, denemeye götürsün): panel.sitetakipet.com.tr/#/kayit formu → 14 günlük deneme firması (isteğe bağlı örnek site), hemen oturum; süre dolunca program kapanır, veriler saklanır; `npm run firma:lisans` ile listeleme/uzatma/kalıcı lisans; tanıtım düğmeleri ve gizlilik.html. Önizleme gösterildi, onay bekleniyor. **Kullanıcıdan:** satış için WhatsApp numarası sunucudaki ayar dosyasına `SATIS_TELEFON=...` olarak eklenecek (yoksa "Satın al" tanıtım sayfasına gider).
- [ ] **Deneme hesabı** (kullanıcı): kendi denemesini artık kayıt formundan açabilir.

## Fikir kutusu
- Ev sahibine kira aktarımı: tahsil edilen kiradan yönetim komisyonu düşülüp ev sahibine ödenecek tutar, ev sahibi ekstresi (kullanıcıya soruldu, 9 Kasım).
- Ev sahibinin oturduğu dairelerde aidat/gider takibi.
- Site başına ayrı banka hesabı / ekstre (bugün ekstre firma geneli, eşleşme bütün sitelerde aranır).
- Site bazında karşılaştırmalı rapor (doluluk, tahsilat oranı).
- Kiracıya otomatik SMS/WhatsApp hatırlatma (bugün: metin ve bağlantı hazırlanıyor, gönderim elle).
- Depozito iadesi / borçtan mahsup.
- Aidat, vergi, bakım gibi mülk giderleri ve daire bazında net gelir.
- Sözleşme bitişi yaklaşınca uyarı, yıllık kira artışı (TÜFE) önerisi.
- Banka API'siyle (açık bankacılık) ekstreyi kendiliğinden çekme.
