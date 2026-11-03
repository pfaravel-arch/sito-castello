-- Eventi gestiti dall'area riservata (prima stavano in data/eventi.json)
CREATE TABLE IF NOT EXISTS eventi (
  id              TEXT    PRIMARY KEY,               -- nome breve, non cambia mai
  titolo          TEXT    NOT NULL,
  data            TEXT    NOT NULL,                  -- AAAA-MM-GG
  fine            TEXT,                              -- AAAA-MM-GG, per eventi di piu' giorni
  orario          TEXT,
  luogo           TEXT,
  descrizione     TEXT,
  avviso          TEXT,
  stato           TEXT    NOT NULL DEFAULT 'bozza',  -- 'bozza' | 'pubblicato' | 'chiuso'
  in_evidenza     INTEGER NOT NULL DEFAULT 0,
  pren_attive     INTEGER NOT NULL DEFAULT 0,
  pren_fasce      TEXT,                              -- JSON: {"dalle","alle","ogni"} oppure ["17:00",...] oppure null (unica)
  pren_posti      INTEGER NOT NULL DEFAULT 15,
  pren_max        INTEGER NOT NULL DEFAULT 10,
  pren_chiusura   TEXT,                              -- AAAA-MM-GGTHH:MM ora italiana
  locandina       BLOB,
  locandina_tipo  TEXT,
  locandina_ver   INTEGER NOT NULL DEFAULT 0,
  creato          TEXT    NOT NULL DEFAULT (datetime('now')),
  aggiornato      TEXT
);
CREATE INDEX IF NOT EXISTS idx_eventi_data ON eventi (data);
