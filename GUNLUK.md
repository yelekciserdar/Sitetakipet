# Değişiklik günlüğü

En yenisi en üstte. Her kayıtta: ne yapıldı, neden, sunucuda elle yapılan işlem varsa o.

---

## 2026-11-09

- **Proje kuruldu** (kullanıcı kararı: kira ve düğün salonu ayrı ürün, satılık). Kaynak: müşterinin "Kira Takip Uygulaması rev05" Excel'inin iş mantığı.
- Şema: daireler, sözleşmeler, aylık kira borçları, tahsilatlar + ödeme dağılımı, banka hareketleri, eşleşme kaydı.
- Excel'deki hatalar düzeltildi: fazla ödeme kırpılmıyor (avans olup sonraki aya düşer); her ödeme ayrı kayıt; aynı ekstre iki kez yüklenince hareketler mükerrer girmez; ad eşleştirmesi tam kelime; gecikme durumu kendiliğinden güncel; ayrılan kiracının kira tutarı sıfırlanmıyor; T.C. kimlik no şifreli.
- Banka ekstresi: CSV ve XLSX (dış kütüphanesiz okuyucu), puanla eşleştirme (kod, IBAN, ad, tutar, tarih), elle eşleştirme, "kira değil".
- Gecikenler: SMS metni ve WhatsApp bağlantısı. Rapor: ekranda, CSV (Excel), yazdır/PDF.
- Arayüz (önizleme, onay bekliyor): renkler kullanıcı seçimi #F0F0F0 / #105BFF / #FE8500; giriş sol yarısı mavi, kenar çubuğu beyaz.
- 17 test (gerçek PostgreSQL) yeşil.
