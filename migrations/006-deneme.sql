-- Kendi kendine deneme hesabı: tanıtım sayfasındaki "Ücretsiz deneyin" ile açılan firmalar.
-- deneme_bitis dolu ve geçmişse firma giriş yapabilir ama programı kullanamaz (veriler silinmez);
-- lisans verilince NULL olur (scripts/firma-lisans.js).
ALTER TABLE firmalar ADD COLUMN deneme_bitis timestamptz;
ALTER TABLE firmalar ADD COLUMN telefon text CHECK (length(telefon) <= 30);
ALTER TABLE firmalar ADD COLUMN kayit_kaynagi text NOT NULL DEFAULT 'Elle' CHECK (kayit_kaynagi IN ('Elle', 'Deneme kaydı'));
ALTER TABLE firmalar ADD COLUMN kvkk_onay timestamptz;
