// user.db's schema (spec §5.3). user.db is created on the device on first use and is never an asset,
// so rebuilding canto.db (data-pipeline) never touches it.

/** user.db's file name in the app's SQLite directory. */
export const USER_DB_NAME = "user.db";

/** History keeps at most this many rows; older ones are dropped on insert. */
export const HISTORY_LIMIT = 500;

/**
 * Idempotent: safe to run on every open. The trigger enforces HISTORY_LIMIT. History is ordered by id
 * (AUTOINCREMENT, so it only grows), not by at: a clock set back can't make a new row the oldest.
 */
export const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS favorites (
  entry_id INTEGER PRIMARY KEY,
  added_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('lookup', 'translation')),
  entry_id INTEGER NULL,
  input TEXT NULL,
  output TEXT NULL,
  at INTEGER NOT NULL,
  CHECK ((kind = 'lookup') = (entry_id IS NOT NULL AND input IS NULL AND output IS NULL)),
  CHECK ((kind = 'translation') = (entry_id IS NULL AND input IS NOT NULL AND output IS NOT NULL))
);
DROP TRIGGER IF EXISTS history_cap;
CREATE TRIGGER history_cap AFTER INSERT ON history BEGIN
  DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ${HISTORY_LIMIT});
END;
`;
