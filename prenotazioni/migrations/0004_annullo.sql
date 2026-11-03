-- Chiave personale per l'annullamento dal link nell'e-mail di conferma
ALTER TABLE prenotazioni ADD COLUMN chiave_annullo TEXT;
ALTER TABLE prenotazioni ADD COLUMN annullata_da TEXT; -- 'partecipante' | 'staff'
