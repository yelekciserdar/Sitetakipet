# Durum ve yol haritası

## Sıradaki ve yarım kalan işler
- [ ] **İlk sürüm** (`claude/ilk-surum` dalı): şema, kira ve banka kuralları, API yazıldı (9 Kasım). Sırada: testler, arayüz (önizlemeyle), Docker/README.
- [ ] **Arayüz renkleri (9 Kasım, kullanıcı kararı):** #F0F0F0 marshmallow beyazı (zemin), #105BFF (ana renk), #FE8500 (vurgu/uyarı). Yazılar okunurluk için koyu nötr gri. Yazı logo: "Kira" koyu, "Takip" #105BFF, "Et" #FE8500. Logo (simge) kullanıcıda.
- [ ] Excel'den aktarım: müşterinin "Kira Takip" .xlsm dosyasındaki daire/kiracı/kira sayfalarını içe alma (müşteri isterse).
- [ ] Canlı kurulum: alan adı, sunucu, HTTPS, yedekleme; `VERI_ANAHTARI` (T.C. şifre anahtarı) güvenli saklanacak.
- [ ] Satış: fiyatlandırma, deneme süresi, firma açma akışı (şimdilik `npm run firma:olustur`).

## Fikir kutusu
- Kiracıya otomatik SMS/WhatsApp hatırlatma (bugün: metin ve bağlantı hazırlanıyor, gönderim elle).
- Depozito iadesi / borçtan mahsup.
- Aidat, vergi, bakım gibi mülk giderleri ve daire bazında net gelir.
- Sözleşme bitişi yaklaşınca uyarı, yıllık kira artışı (TÜFE) önerisi.
- Banka API'siyle (açık bankacılık) ekstreyi kendiliğinden çekme.
