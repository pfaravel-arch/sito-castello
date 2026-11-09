-- Percorsi di un evento con posti separati negli stessi orari (es. escape room "Adulti" e "Bambini")
ALTER TABLE eventi ADD COLUMN pren_percorsi TEXT;           -- JSON: ["Adulti","Bambini"]; vuoto = percorso unico
ALTER TABLE prenotazioni ADD COLUMN percorso TEXT NOT NULL DEFAULT '';
