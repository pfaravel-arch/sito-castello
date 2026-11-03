-- Prenotazioni degli eventi del Castello
CREATE TABLE IF NOT EXISTS prenotazioni (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codice      TEXT    NOT NULL UNIQUE,
  evento      TEXT    NOT NULL,
  fascia      TEXT    NOT NULL,
  nome        TEXT    NOT NULL,
  cognome     TEXT    NOT NULL,
  email       TEXT,
  telefono    TEXT,
  persone     INTEGER NOT NULL CHECK (persone > 0),
  socio       TEXT    NOT NULL DEFAULT 'si',      -- 'si' gia' socio, 'richiesta' chiede di aderire
  note        TEXT,
  stato       TEXT    NOT NULL DEFAULT 'confermata', -- 'confermata' | 'annullata'
  pagato      INTEGER NOT NULL DEFAULT 0,
  creata      TEXT    NOT NULL DEFAULT (datetime('now')),
  aggiornata  TEXT
);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_evento_fascia ON prenotazioni (evento, fascia);
