# Çalışma notları

- Kullanıcıyla Türkçe konuş. Gizli bilgi (parola, API anahtarı, sunucu adresi) isteme, gösterme, depoya yazma; örneklerde "deneme" gibi sahte değerler kullan.
- Her değişiklikten sonra `GUNLUK.md`'nin en üstüne o günün tarihiyle kısa Türkçe kayıt ekle (ne, neden, sunucuda elle yapılan işlem).
- Açık işler ve yol haritası `DURUM.md`'de; iş bitince kutuyu [x] yap. Yeni fikir ya da yarım iş çıkınca hemen ekle.
- Müşterinin gerçek verisi (Excel dosyaları vb.) depoya konmaz; yalnız oturumun geçici klasöründe işlenir.
- Bir işin bütün parçaları tek dalda ve tek PR'da toplanır. İş bitince testler bir kez çalıştırılır (`TEST_DATABASE_URL=... npm test`).
- Görünür her ekran değişikliğinden önce ekran görüntüsüyle önizleme göster, onay al.
- Kardeş ürün SalonTakipEt ayrı depodadır; ortak altyapı kodu (db, dogrula, oturum, uygulama) iki depoda aynı tutulmaya çalışılır.
- Her iş tablosunda `firma_id` vardır; her sorgu oturumdaki firma ile süzülür. Yeni uçlarda firma ayrımı testi yazılır.
- Kiracının T.C. kimlik nosu şifreli saklanır (`lib/gizli.js`, `VERI_ANAHTARI`); açık hâli yalnız yöneticiye gösterilir ve her görüntüleme işlem kaydına yazılır. Bu kural gevşetilmez.
- Para hareketi değiştiren her yerde `dagit()` çağrılır; borcun kalanı elle tutulmaz, sorguda hesaplanır.
