-- Ev sahibi: her dairenin ev sahibi (mal sahibi) kişi kartına bağlanabilir.
-- Dairede ev sahibinin kendisi oturuyorsa ev_sahibi_oturuyor = true (kira borcu yazılmaz, daire "boş" sayılmaz).
-- Oturum durumu: aktif sözleşme varsa "Kiracılı", yoksa ev_sahibi_oturuyor ise "Ev sahibi", değilse "Boş".

ALTER TABLE daireler ADD COLUMN ev_sahibi_id bigint REFERENCES kisiler(id);
ALTER TABLE daireler ADD COLUMN ev_sahibi_oturuyor boolean NOT NULL DEFAULT false;
CREATE INDEX daireler_ev_sahibi ON daireler (ev_sahibi_id) WHERE ev_sahibi_id IS NOT NULL;
