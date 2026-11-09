-- Siteler: bir yönetim firması birden çok siteyi (apartman / site kompleksi) yönetir; her daire bir siteye bağlıdır.
-- Personel bir ya da birkaç siteye atanabilir (kullanici_siteleri); ataması olmayan personel ve yönetici bütün siteleri görür.

CREATE TABLE siteler (
  id         bigserial PRIMARY KEY,
  firma_id   bigint NOT NULL REFERENCES firmalar(id),
  ad         text NOT NULL CHECK (length(ad) BETWEEN 1 AND 120),
  adres      text CHECK (length(adres) <= 500),
  aktif      boolean NOT NULL DEFAULT true,
  olusturma  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX siteler_ad ON siteler (firma_id, lower(ad));

-- Var olan her firmaya "Ana Site" açılır ve daireleri ona bağlanır.
INSERT INTO siteler (firma_id, ad) SELECT id, 'Ana Site' FROM firmalar;

ALTER TABLE daireler ADD COLUMN site_id bigint REFERENCES siteler(id);
UPDATE daireler d SET site_id = s.id FROM siteler s WHERE s.firma_id = d.firma_id;
ALTER TABLE daireler ALTER COLUMN site_id SET NOT NULL;
CREATE INDEX daireler_site ON daireler (site_id);

-- Daire numarası site içinde tekildir (farklı sitelerde aynı "A Blok 1" olabilir).
DROP INDEX daireler_no;
CREATE UNIQUE INDEX daireler_no ON daireler (site_id, lower(COALESCE(blok, '')), lower(daire_no));

CREATE TABLE kullanici_siteleri (
  kullanici_id  bigint NOT NULL REFERENCES kullanicilar(id) ON DELETE CASCADE,
  site_id       bigint NOT NULL REFERENCES siteler(id) ON DELETE CASCADE,
  PRIMARY KEY (kullanici_id, site_id)
);
