-- canto.db schema (spec §4.3). writeDb runs this on an empty database, then inserts rows in Entry
-- order, so child rows' rowids keep each entry's order (reading priority, sense order).
-- Columns the spec marks NULL are optional; the rest are NOT NULL. Loan columns hold comma-separated
-- 0-based syllable indexes; mandarin.sources holds comma-separated sources in priority order.

CREATE TABLE entries (
  id   INTEGER PRIMARY KEY,
  trad TEXT NOT NULL,
  simp TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('char', 'word')),
  freq REAL NOT NULL
);

-- Other spellings folded into the entry: 這裡 for 這裏, words.hk variant 㨂 for 揀.
CREATE TABLE aliases (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  trad     TEXT NOT NULL,
  simp     TEXT NOT NULL
);

CREATE TABLE readings (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  jyutping TEXT NOT NULL,
  rank     TEXT NULL,
  source   TEXT NOT NULL,
  loan     TEXT NULL
);

CREATE TABLE mandarin (
  entry_id  INTEGER NOT NULL REFERENCES entries (id),
  word_trad TEXT NOT NULL,
  word_simp TEXT NOT NULL,
  sources   TEXT NOT NULL
);

CREATE TABLE definitions (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  sense    INTEGER NOT NULL,
  pos      TEXT NULL,
  yue      TEXT NULL,
  yue_simp TEXT NULL,
  zho      TEXT NULL,
  zho_simp TEXT NULL,
  source   TEXT NOT NULL
);

CREATE TABLE examples (
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  sense    INTEGER NOT NULL,
  yue_trad TEXT NOT NULL,
  yue_simp TEXT NOT NULL,
  jyutping TEXT NULL,
  loan     TEXT NULL,
  zho      TEXT NULL,
  zho_simp TEXT NULL,
  source   TEXT NOT NULL
);

-- COLLATE NOCASE lets SQLite use the key index for `key LIKE 'sik%'` (LIKE is case-insensitive by
-- default); keys are lowercase anyway.
CREATE TABLE search_keys (
  key      TEXT NOT NULL COLLATE NOCASE,
  entry_id INTEGER NOT NULL REFERENCES entries (id),
  type     TEXT NOT NULL CHECK (type IN ('toned', 'toneless', 'joined'))
);

CREATE INDEX entries_trad ON entries (trad);
CREATE INDEX entries_simp ON entries (simp);
CREATE INDEX aliases_trad ON aliases (trad);
CREATE INDEX aliases_simp ON aliases (simp);
CREATE INDEX aliases_entry ON aliases (entry_id);
CREATE INDEX readings_entry ON readings (entry_id);
CREATE INDEX mandarin_entry ON mandarin (entry_id);
CREATE INDEX definitions_entry ON definitions (entry_id);
CREATE INDEX examples_entry ON examples (entry_id);
CREATE INDEX search_keys_key ON search_keys (key);
CREATE INDEX search_keys_entry ON search_keys (entry_id);
