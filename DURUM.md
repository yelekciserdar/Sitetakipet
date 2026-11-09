# Durum ve yol haritası

## Sıradaki ve yarım kalan işler
- [ ] **Yeniden konumlandırma (9 Kasım, kullanıcı):** ürünü site yönetim/danışmanlık firmaları kullanacak; konu kira değil **aidat** (ve site giderleri). Ev sahibine aktarım/komisyon yok. Mevcut altyapı (daire, kişi, aylık tahakkuk, ödeme dağıtımı, banka eşleştirme, gecikenler, çoklu site, ev sahibi=malik) korunur; aidat planı, gider ve kasa, gecikme tazminatı, makbuz eklenecek. Ürün adı birlikte bulunacak (Claude seçenek sundu, 9 Kasım). **Kira takibi ayrı bir bölüm olarak kalır** (kullanıcı: isteyen kullanır) → firma ayarından açılıp kapanan modül.
- [ ] **Ev sahibi** (`claude/ev-sahibi` dalı, 9 Kasım): ev sahibi kartı ve Kiracılı/Ev sahibi/Boş durumu hazır; önizleme gösterildi, kullanıcı onayı bekleniyor.
- [x] **İlk sürüm** (9 Kasım, kullanıcı onayladı, PR #1): şema, kira ve banka kuralları, API, 18 test, arayüz, çoklu site ve site yetkisi, Docker/README.
- [x] **Arayüz renkleri (9 Kasım, kullanıcı kararı):** #F0F0F0 marshmallow beyazı (zemin), #105BFF (ana renk), #FE8500 (vurgu/uyarı). Yazılar okunurluk için koyu nötr gri. Yazı logo: "Kira" koyu, "Takip" #105BFF, "Et" #FE8500. 
- [ ] **Logo** (simge) kullanıcıda; gelince geçici "K" işaretinin yerine konur.
- [ ] Excel'den aktarım: müşterinin "Kira Takip" .xlsm dosyasındaki daire/kiracı/kira sayfalarını içe alma (müşteri isterse).
- [ ] Canlı kurulum: alan adı, sunucu, HTTPS, yedekleme; `VERI_ANAHTARI` (T.C. şifre anahtarı) güvenli saklanacak.
- [ ] Satış: fiyatlandırma, deneme süresi, firma açma akışı (şimdilik `npm run firma:olustur`).

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
