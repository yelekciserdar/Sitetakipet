-- Kira: daireler, sözleşmeler, aylık kira borçları, tahsilatlar, ödeme dağılımı, banka hareketleri, eşleşme kaydı.
--
-- Para akışı: her tahsilat bir sözleşmeye girer ve o sözleşmenin açık borçlarına en eski vadeden başlayarak
-- dağıtılır (odeme_dagilimi). Fazla ödeme kaybolmaz (Excel'de kırpılıyordu): dağıtılamayan kısım sözleşmenin
-- avansıdır ve yeni ay borcu oluşunca kendiliğinden ona düşer. Borcun kalanı ve durumu sorguda hesaplanır.

CREATE TABLE daireler (
  id          bigserial PRIMARY KEY,
  firma_id    bigint NOT NULL REFERENCES firmalar(id),
  daire_no    text NOT NULL CHECK (length(daire_no) BETWEEN 1 AND 30),
  blok        text CHECK (length(blok) <= 30),
  kat         text CHECK (length(kat) <= 10),
  metrekare   numeric(8,2) CHECK (metrekare > 0 AND metrekare < 100000),
  oda         text CHECK (length(oda) <= 20),
  tip         text NOT NULL DEFAULT 'Konut' CHECK (tip IN ('Konut', 'İşyeri', 'Depo', 'Diğer')),
  adres       text CHECK (length(adres) <= 500),
  notlar      text CHECK (length(notlar) <= 2000),
  aktif       boolean NOT NULL DEFAULT true,
  olusturma   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX daireler_no ON daireler (firma_id, lower(COALESCE(blok, '')), lower(daire_no));

CREATE TABLE sozlesmeler (
  id              bigserial PRIMARY KEY,
  firma_id        bigint NOT NULL REFERENCES firmalar(id),
  daire_id        bigint NOT NULL REFERENCES daireler(id),
  kisi_id         bigint NOT NULL REFERENCES kisiler(id),
  baslangic       date NOT NULL,
  bitis           date,
  aylik_kira      numeric(14,2) NOT NULL CHECK (aylik_kira > 0),
  depozito        numeric(14,2) NOT NULL DEFAULT 0 CHECK (depozito >= 0),
  odeme_gunu      int NOT NULL CHECK (odeme_gunu BETWEEN 1 AND 31),
  durum           text NOT NULL DEFAULT 'Aktif' CHECK (durum IN ('Aktif', 'Ayrıldı')),
  ayrilis_tarihi  date,
  notlar          text CHECK (length(notlar) <= 2000),
  olusturma       timestamptz NOT NULL DEFAULT now(),
  CHECK (bitis IS NULL OR bitis >= baslangic)
);
-- Bir dairede aynı anda tek aktif sözleşme.
CREATE UNIQUE INDEX sozlesmeler_aktif_daire ON sozlesmeler (daire_id) WHERE durum = 'Aktif';
CREATE INDEX sozlesmeler_firma ON sozlesmeler (firma_id, durum);

CREATE TABLE kira_borclari (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  sozlesme_id   bigint NOT NULL REFERENCES sozlesmeler(id),
  donem         text NOT NULL CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  vade          date NOT NULL,
  tutar         numeric(14,2) NOT NULL CHECK (tutar > 0),
  aciklama      text CHECK (length(aciklama) <= 500),
  iptal         boolean NOT NULL DEFAULT false,
  olusturma     timestamptz NOT NULL DEFAULT now()
);
-- Bir sözleşmenin bir ayı için tek borç (tahakkuk iki kez çalışsa da çift borç oluşmaz).
CREATE UNIQUE INDEX kira_borclari_donem ON kira_borclari (sozlesme_id, donem) WHERE NOT iptal;
CREATE INDEX kira_borclari_firma ON kira_borclari (firma_id, donem) WHERE NOT iptal;

CREATE TABLE banka_hareketleri (
  id                     bigserial PRIMARY KEY,
  firma_id               bigint NOT NULL REFERENCES firmalar(id),
  tarih                  date NOT NULL,
  aciklama               text NOT NULL CHECK (length(aciklama) <= 1000),
  tutar                  numeric(14,2) NOT NULL CHECK (tutar > 0),
  gonderen               text CHECK (length(gonderen) <= 200),
  iban                   text CHECK (length(iban) <= 40),
  dosya                  text CHECK (length(dosya) <= 200),
  -- Aynı ekstre iki kez yüklenirse aynı hareket ikinci kez girmez (Excel'de kira iki kez ödenmiş görünüyordu)
  parmak_izi             text NOT NULL,
  durum                  text NOT NULL DEFAULT 'Bekliyor'
                         CHECK (durum IN ('Bekliyor', 'Otomatik Eşleşti', 'Kontrol Gerekli', 'Eşleşmedi', 'Elle Eşleşti', 'Yok Sayıldı')),
  onerilen_sozlesme_id   bigint REFERENCES sozlesmeler(id),
  puan                   int,
  detay                  text,
  olusturma              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX banka_hareketleri_tekil ON banka_hareketleri (firma_id, parmak_izi);

CREATE TABLE tahsilatlar (
  id                 bigserial PRIMARY KEY,
  firma_id           bigint NOT NULL REFERENCES firmalar(id),
  sozlesme_id        bigint NOT NULL REFERENCES sozlesmeler(id),
  tarih              date NOT NULL,
  tutar              numeric(14,2) NOT NULL CHECK (tutar > 0),
  odeme_turu         text NOT NULL CHECK (odeme_turu IN ('Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer')),
  kaynak             text NOT NULL DEFAULT 'Elle' CHECK (kaynak IN ('Elle', 'Banka')),
  banka_hareket_id   bigint REFERENCES banka_hareketleri(id),
  aciklama           text CHECK (length(aciklama) <= 500),
  iptal              boolean NOT NULL DEFAULT false,
  iptal_nedeni       text CHECK (length(iptal_nedeni) <= 500),
  olusturan_id       bigint REFERENCES kullanicilar(id),
  olusturma          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tahsilatlar_sozlesme ON tahsilatlar (sozlesme_id) WHERE NOT iptal;
CREATE INDEX tahsilatlar_tarih ON tahsilatlar (firma_id, tarih) WHERE NOT iptal;
-- Bir banka hareketi en fazla bir (iptal edilmemiş) tahsilata dönüşür.
CREATE UNIQUE INDEX tahsilatlar_banka ON tahsilatlar (banka_hareket_id) WHERE banka_hareket_id IS NOT NULL AND NOT iptal;

CREATE TABLE odeme_dagilimi (
  tahsilat_id  bigint NOT NULL REFERENCES tahsilatlar(id) ON DELETE CASCADE,
  borc_id      bigint NOT NULL REFERENCES kira_borclari(id) ON DELETE CASCADE,
  tutar        numeric(14,2) NOT NULL CHECK (tutar > 0),
  PRIMARY KEY (tahsilat_id, borc_id)
);
CREATE INDEX odeme_dagilimi_borc ON odeme_dagilimi (borc_id);

CREATE TABLE eslesme_kaydi (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  hareket_id    bigint NOT NULL REFERENCES banka_hareketleri(id),
  sozlesme_id   bigint REFERENCES sozlesmeler(id),
  puan          int,
  sonuc         text NOT NULL,
  detay         text,
  kullanici_id  bigint REFERENCES kullanicilar(id),
  zaman         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eslesme_kaydi_hareket ON eslesme_kaydi (hareket_id);
