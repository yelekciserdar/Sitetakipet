# KiraTakipEt

Daire ve kira takibi için web tabanlı yönetim sistemi. Birden çok firmaya satılır; her firmanın verisi ayrıdır.
Node.js 22 + PostgreSQL 16, dış çatı yok; tek bağımlılık `pg`. Kardeş ürün **SalonTakipEt** ayrı depodadır.

## Neler var
- **Daireler** (blok, kat, m², oda, tip) ve **kiracılar** (telefon, IBAN, ödeme açıklama kodu, şifreli T.C. kimlik no).
- **Sözleşme:** aylık kira, depozito, ödeme günü; dairede tek aktif kiracı. Kira artışı sonraki aylara (istenirse bu aya da) uygulanır.
- **Aylık kira borcu** her ay kendiliğinden oluşur (sunucu saatte bir dener, çift borç oluşmaz); geçmiş aylar elle oluşturulabilir.
- **Ödemeler** en eski borçtan başlayarak düşer; fazlası avans olur ve yeni ayın borcuna kendiliğinden düşer. İptal edilen ödeme yeniden dağıtılır.
- **Durumlar** (Bekliyor / Kısmi / Gecikti / Ödendi) ve gecikme günü her an güncel hesaplanır; gecikme eşiği ve yaklaşan uyarı günü Ayarlar'dan.
- **Banka ekstresi** (XLSX/CSV): mükerrer hareket atlanır; açıklama kodu (+40), IBAN (+40), ad soyad (+30), tutar (+30/+15/+10), tarih (+20) ile puanlanır. 80+ tek aday otomatik işlenir, 50–79 ya da eşit puanlı birden çok aday "Kontrol Gerekli".
- **Gecikenler:** kiracı başına SMS metni ve WhatsApp bağlantısı.
- **Raporlar:** dönem aralığı, CSV (Excel'de doğrudan açılır, formül enjeksiyonuna karşı korumalı), yazdır/PDF.
- **Ayrılış:** sözleşme kapanır, ileri ay borçları iptal, açık borç alacak olarak kalır.
- **Roller:** yönetici ve personel (panel, daireler, kiracılar, kira takibi, ödeme alma, gecikenler).

## Çalıştırma
```bash
npm ci
cp .env.example .env   # DATABASE_URL ve VERI_ANAHTARI
npm run migrate
npm run firma:olustur -- --firma "Deneme Gayrimenkul" --yonetici "Ad Soyad" --eposta deneme@ornek.com
npm start
```
Docker: `.env` içine `POSTGRES_PASSWORD=...` ve `VERI_ANAHTARI=...` yazıp `docker compose up -d --build`.
Sahte verili tanıtım firması: `docker compose exec -e DEMO_PAROLASI=... app node scripts/demo-veri.js` (giriş `demo@deneme.test`).

## Test
Testler gerçek PostgreSQL ister ve verilen veritabanını **sıfırlar**:
```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/kira_test npm test
```
