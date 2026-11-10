-- Aidat (site yönetimi): programın ana işi. Kira takibi isteğe bağlı bir bölüm olarak kalır (firmalar.kira_modulu).
--
-- Para akışı: aidat ve ek toplama borçları bağımsız bölüme (daireye) yazılır. Tahsilat daireye girer ve o dairenin
-- açık borçlarına en eski vadeden başlayarak dağıtılır (aidat_dagilimi). Fazla ödeme dairenin avansıdır, yeni borç
-- oluşunca kendiliğinden ona düşer. Borcun kalanı, durumu ve gecikme tazminatı sorguda hesaplanır, elle tutulmaz.

-- Kira bölümü: yeni firmalarda kapalı; kira verisi olan mevcut firmalarda açık.
ALTER TABLE firmalar ADD COLUMN kira_modulu boolean NOT NULL DEFAULT false;
UPDATE firmalar f SET kira_modulu = true WHERE EXISTS (SELECT 1 FROM sozlesmeler s WHERE s.firma_id = f.id);
-- Makbuz numarası firma bazında sıra ile verilir.
ALTER TABLE firmalar ADD COLUMN son_makbuz_no int NOT NULL DEFAULT 0;

-- Sitenin aidat planı (işletme projesi):
--   Sabit      → her daire aylık aidat_tutari öder
--   Eşit       → aylık bütçe (aidat_tutari) dairelere eşit bölünür
--   Arsa payı  → bütçe arsa payı oranında bölünür (KMK'da varsayılan kural)
--   Metrekare  → bütçe brüt m² oranında bölünür
-- Dairede aidat_ozel varsa o daire sabit o tutarı öder; bütçenin kalanı diğerlerine bölünür.
ALTER TABLE siteler ADD COLUMN aidat_yontemi text NOT NULL DEFAULT 'Sabit'
  CHECK (aidat_yontemi IN ('Sabit', 'Eşit', 'Arsa payı', 'Metrekare'));
ALTER TABLE siteler ADD COLUMN aidat_tutari numeric(14,2) CHECK (aidat_tutari > 0);
ALTER TABLE siteler ADD COLUMN aidat_gunu int NOT NULL DEFAULT 10 CHECK (aidat_gunu BETWEEN 1 AND 28);
ALTER TABLE siteler ADD COLUMN aidat_baslangic text CHECK (aidat_baslangic ~ '^\d{4}-(0[1-9]|1[0-2])$');
-- Gecikme tazminatı: KMK md. 20'ye göre aylık %5'i geçemez; 0 = hesaplanmaz.
ALTER TABLE siteler ADD COLUMN gecikme_orani numeric(5,2) NOT NULL DEFAULT 5 CHECK (gecikme_orani BETWEEN 0 AND 5);
-- Sakinlere hatırlatma ve makbuzda gösterilen yönetim hesabı.
ALTER TABLE siteler ADD COLUMN iban text CHECK (iban ~ '^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$');

ALTER TABLE daireler ADD COLUMN arsa_payi numeric(12,4) CHECK (arsa_payi > 0);
ALTER TABLE daireler ADD COLUMN aidat_ozel numeric(14,2) CHECK (aidat_ozel > 0);

-- Ek toplama: demirbaş, çatı onarımı, boya gibi tek seferlik giderin dairelere paylaştırılması.
CREATE TABLE ek_toplamalar (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  site_id       bigint NOT NULL REFERENCES siteler(id),
  aciklama      text NOT NULL CHECK (length(aciklama) BETWEEN 1 AND 300),
  toplam        numeric(14,2) NOT NULL CHECK (toplam > 0),
  yontem        text NOT NULL CHECK (yontem IN ('Eşit', 'Arsa payı', 'Metrekare')),
  vade          date NOT NULL,
  iptal         boolean NOT NULL DEFAULT false,
  olusturan_id  bigint REFERENCES kullanicilar(id),
  olusturma     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ek_toplamalar_site ON ek_toplamalar (site_id) WHERE NOT iptal;

CREATE TABLE aidat_borclari (
  id          bigserial PRIMARY KEY,
  firma_id    bigint NOT NULL REFERENCES firmalar(id),
  daire_id    bigint NOT NULL REFERENCES daireler(id),
  tur         text NOT NULL CHECK (tur IN ('Aidat', 'Ek Toplama')),
  donem       text NOT NULL CHECK (donem ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  vade        date NOT NULL,
  tutar       numeric(14,2) NOT NULL CHECK (tutar > 0),
  aciklama    text CHECK (length(aciklama) <= 500),
  toplama_id  bigint REFERENCES ek_toplamalar(id),
  iptal       boolean NOT NULL DEFAULT false,
  olusturma   timestamptz NOT NULL DEFAULT now(),
  CHECK ((tur = 'Ek Toplama') = (toplama_id IS NOT NULL))
);
-- Bir dairenin bir ayı için tek aidat (tahakkuk iki kez çalışsa da çift borç oluşmaz).
CREATE UNIQUE INDEX aidat_borclari_donem ON aidat_borclari (daire_id, donem) WHERE tur = 'Aidat' AND NOT iptal;
CREATE INDEX aidat_borclari_daire ON aidat_borclari (daire_id) WHERE NOT iptal;
CREATE INDEX aidat_borclari_firma ON aidat_borclari (firma_id, donem) WHERE NOT iptal;

CREATE TABLE aidat_tahsilatlari (
  id                 bigserial PRIMARY KEY,
  firma_id           bigint NOT NULL REFERENCES firmalar(id),
  daire_id           bigint NOT NULL REFERENCES daireler(id),
  makbuz_no          int NOT NULL,
  tarih              date NOT NULL,
  tutar              numeric(14,2) NOT NULL CHECK (tutar > 0),
  odeme_turu         text NOT NULL CHECK (odeme_turu IN ('Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer')),
  odeyen             text CHECK (length(odeyen) <= 120),
  kaynak             text NOT NULL DEFAULT 'Elle' CHECK (kaynak IN ('Elle', 'Banka')),
  banka_hareket_id   bigint REFERENCES banka_hareketleri(id),
  aciklama           text CHECK (length(aciklama) <= 500),
  iptal              boolean NOT NULL DEFAULT false,
  iptal_nedeni       text CHECK (length(iptal_nedeni) <= 500),
  olusturan_id       bigint REFERENCES kullanicilar(id),
  olusturma          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX aidat_tahsilatlari_makbuz ON aidat_tahsilatlari (firma_id, makbuz_no);
CREATE INDEX aidat_tahsilatlari_daire ON aidat_tahsilatlari (daire_id) WHERE NOT iptal;
CREATE INDEX aidat_tahsilatlari_tarih ON aidat_tahsilatlari (firma_id, tarih) WHERE NOT iptal;
CREATE UNIQUE INDEX aidat_tahsilatlari_banka ON aidat_tahsilatlari (banka_hareket_id) WHERE banka_hareket_id IS NOT NULL AND NOT iptal;

CREATE TABLE aidat_dagilimi (
  tahsilat_id  bigint NOT NULL REFERENCES aidat_tahsilatlari(id) ON DELETE CASCADE,
  borc_id      bigint NOT NULL REFERENCES aidat_borclari(id) ON DELETE CASCADE,
  tutar        numeric(14,2) NOT NULL CHECK (tutar > 0),
  PRIMARY KEY (tahsilat_id, borc_id)
);
CREATE INDEX aidat_dagilimi_borc ON aidat_dagilimi (borc_id);

-- Sitenin giderleri (elektrik, su, temizlik, güvenlik, bakım...). Kasa = tahsilatlar − giderler.
CREATE TABLE giderler (
  id            bigserial PRIMARY KEY,
  firma_id      bigint NOT NULL REFERENCES firmalar(id),
  site_id       bigint NOT NULL REFERENCES siteler(id),
  tarih         date NOT NULL,
  kategori      text NOT NULL CHECK (length(kategori) BETWEEN 1 AND 60),
  aciklama      text CHECK (length(aciklama) <= 500),
  tutar         numeric(14,2) NOT NULL CHECK (tutar > 0),
  odeme_turu    text NOT NULL CHECK (odeme_turu IN ('Nakit', 'Kredi Kartı', 'Havale/EFT', 'Diğer')),
  belge_no      text CHECK (length(belge_no) <= 60),
  iptal         boolean NOT NULL DEFAULT false,
  iptal_nedeni  text CHECK (length(iptal_nedeni) <= 500),
  olusturan_id  bigint REFERENCES kullanicilar(id),
  olusturma     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX giderler_site ON giderler (site_id, tarih) WHERE NOT iptal;

-- Banka hareketi aidat için bir daireye de önerilebilir.
ALTER TABLE banka_hareketleri ADD COLUMN onerilen_daire_id bigint REFERENCES daireler(id);
