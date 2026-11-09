-- Da dove arriva la prenotazione: 'sito' (modulo online) oppure inserita dallo staff ('whatsapp', 'telefono', 'di persona', 'email')
ALTER TABLE prenotazioni ADD COLUMN origine TEXT NOT NULL DEFAULT 'sito';
