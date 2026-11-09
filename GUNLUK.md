# Değişiklik günlüğü

En yenisi en üstte. Her kayıtta: ne yapıldı, neden, sunucuda elle yapılan işlem varsa o.

---

## 2026-11-09

- **Ev sahibi** (kullanıcı: dairede kiracı değil ev sahibi de oturabilir): her daireye ev sahibi kartı (ad, telefon, e-posta, IBAN) bağlanır; oturum durumu Kiracılı / Ev sahibi / Boş. Ev sahibinin oturduğu daireye kira borcu yazılmaz, boş sayılmaz; kiraya verilince kendiliğinden Kiracılı olur. Panel, özet ve siteler tablosunda üç ayrı sayım; daire listesinde Oturan ve Ev sahibi sütunları (göç 004). 19 test yeşil.
- **Çoklu site** (kullanıcı isteği: firmalar birden çok siteyi yönetiyor, çalışanlar bir ya da birkaç siteye bakıyor): `siteler` tablosu, her daire bir siteye bağlı (daire no site içinde tekil), kenar çubuğunda site seçici (Tüm siteler / site), bütün listeler, özet ve rapor site süzgeçli; personele site ataması (ataması yoksa tüm siteler), yetkisiz sitenin verisi sunucuda da verilmez. Gecikme mesajında site adı. Mevcut veriler "Ana Site"ye taşındı (göç 003). 18 test yeşil.
- **Proje kuruldu** (kullanıcı kararı: kira ve düğün salonu ayrı ürün, satılık). Kaynak: müşterinin "Kira Takip Uygulaması rev05" Excel'inin iş mantığı.
- Şema: daireler, sözleşmeler, aylık kira borçları, tahsilatlar + ödeme dağılımı, banka hareketleri, eşleşme kaydı.
- Excel'deki hatalar düzeltildi: fazla ödeme kırpılmıyor (avans olup sonraki aya düşer); her ödeme ayrı kayıt; aynı ekstre iki kez yüklenince hareketler mükerrer girmez; ad eşleştirmesi tam kelime; gecikme durumu kendiliğinden güncel; ayrılan kiracının kira tutarı sıfırlanmıyor; T.C. kimlik no şifreli.
- Banka ekstresi: CSV ve XLSX (dış kütüphanesiz okuyucu), puanla eşleştirme (kod, IBAN, ad, tutar, tarih), elle eşleştirme, "kira değil".
- Gecikenler: SMS metni ve WhatsApp bağlantısı. Rapor: ekranda, CSV (Excel), yazdır/PDF.
- Arayüz (önizleme, onay bekliyor): renkler kullanıcı seçimi #F0F0F0 / #105BFF / #FE8500; giriş sol yarısı mavi, kenar çubuğu beyaz.
- 17 test (gerçek PostgreSQL) yeşil.
