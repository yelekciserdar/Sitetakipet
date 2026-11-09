-- Çekirdek: firma (programı kullanan işletme), kullanıcı, oturum, kişi (kiracı) kartı, işlem kaydı.
-- Her iş tablosunda firma_id vardır; bir firmanın verisi başka firmaya hiçbir sorguda görünmez.

CREATE TABLE firmalar (
  id                     bigserial PRIMARY KEY,
  ad                     text NOT NULL CHECK (length(ad) BETWEEN 1 AND 200),
  -- Vade üzerinden kaç gün geçince "Gecikti" sayılır
  gecikme_gun            int NOT NULL DEFAULT 2 CHECK (gecikme_gun BETWEEN 0 AND 60),
  -- Vadeye kaç gün kala "yaklaşan ödeme" uyarısı verilir
  yaklasan_gun           int NOT NULL DEFAULT 3 CHECK (yaklasan_gun BETWEEN 0 AND 60),
  varsayilan_odeme_gunu  int NOT NULL DEFAULT 5 CHECK (varsayilan_odeme_gunu BETWEEN 1 AND 31),
  aktif                  boolean NOT NULL DEFAULT true,
  olusturma              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kullanicilar (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  ad_soyad      text NOT NULL CHECK (length(ad_soyad) BETWEEN 1 AND 120),
  eposta        text NOT NULL CHECK (length(eposta) BETWEEN 3 AND 200),
  parola_ozet   text NOT NULL,
  rol           text NOT NULL CHECK (rol IN ('yonetici', 'personel')),
  aktif         boolean NOT NULL DEFAULT true,
  olusturma     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kullanicilar_eposta ON kullanicilar (lower(eposta));

CREATE TABLE oturumlar (
  anahtar_ozet  text PRIMARY KEY,
  kullanici_id  bigint NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  son_kullanma  timestamptz NOT NULL,
  olusturma     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oturumlar_kullanici ON oturumlar (kullanici_id);

-- Kiracı kartı. T.C. kimlik no şifreli saklanır (AES-256-GCM, anahtar sunucu ortamında);
-- listelerde yalnız son 4 hanesi görünür. IBAN banka eşleştirmesi için boşluksuz büyük harfle tutulur.
CREATE TABLE kisiler (
  id           bigserial PRIMARY KEY,
  firma_id     bigint NOT NULL REFERENCES firmalar(id),
  ad_soyad     text NOT NULL CHECK (length(ad_soyad) BETWEEN 1 AND 120),
  telefon      text CHECK (length(telefon) <= 30),
  eposta       text CHECK (length(eposta) <= 200),
  tc_sifreli   text,
  tc_son4      text CHECK (tc_son4 ~ '^\d{4}$'),
  iban         text CHECK (iban ~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$'),
  -- Kiracının havale açıklamasına yazması istenen kod (ör. "D15"); eşleştirmede en güçlü ipucu
  odeme_kodu   text CHECK (length(odeme_kodu) BETWEEN 3 AND 30),
  notlar       text CHECK (length(notlar) <= 2000),
  olusturma    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kisiler_firma ON kisiler (firma_id, lower(ad_soyad));
CREATE UNIQUE INDEX kisiler_odeme_kodu ON kisiler (firma_id, upper(odeme_kodu)) WHERE odeme_kodu IS NOT NULL;

CREATE TABLE islem_kaydi (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  kullanici_id  bigint REFERENCES kullanicilar(id),
  zaman         timestamptz NOT NULL DEFAULT now(),
  tur           text NOT NULL,
  aciklama      text NOT NULL
);
CREATE INDEX islem_kaydi_firma ON islem_kaydi (firma_id, zaman DESC);
