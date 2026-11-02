// Writes merged entries to canto.db (spec §4.3, schema.sql). The build fills a temporary file in one
// transaction, VACUUMs it and only then renames it over `path`, so a failed build leaves no
// half-written database and keeps the previous one.
import Database from "better-sqlite3";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tempPathFor } from "../writeFileAtomic";
import type { Entry } from "../merge/types";
import type { PhraseRow } from "./phraseTable";
import { searchKeys } from "./searchKeys";

const SCHEMA = readFileSync(join(import.meta.dirname, "schema.sql"), "utf8");

/** The small DB built from fixtures/ (npm run data:fixture), committed for the app's tests. */
export const FIXTURE_DB_PATH = join(import.meta.dirname, "../../../assets/test/canto.fixture.db");

/** A loan column: comma-separated 0-based syllable indexes, NULL when there are none. */
const loanColumn = (loan: readonly number[] | undefined): string | null => (loan === undefined || loan.length === 0 ? null : loan.join(","));

function insertAll(db: Database.Database, entries: readonly Entry[]): void {
  const insert = {
    entry: db.prepare("INSERT INTO entries (id, trad, simp, kind, freq) VALUES (?, ?, ?, ?, ?)"),
    alias: db.prepare("INSERT INTO aliases (entry_id, trad, simp) VALUES (?, ?, ?)"),
    reading: db.prepare("INSERT INTO readings (entry_id, jyutping, rank, source, loan) VALUES (?, ?, ?, ?, ?)"),
    mandarin: db.prepare("INSERT INTO mandarin (entry_id, word_trad, word_simp, sources) VALUES (?, ?, ?, ?)"),
    definition: db.prepare(
      "INSERT INTO definitions (entry_id, sense, pos, yue, yue_simp, zho, zho_simp, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    example: db.prepare(
      "INSERT INTO examples (entry_id, sense, yue_trad, yue_simp, jyutping, loan, zho, zho_simp, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ),
    searchKey: db.prepare("INSERT INTO search_keys (key, entry_id, type) VALUES (?, ?, ?)"),
  };
  entries.forEach((entry, i) => {
    const id = i + 1;
    insert.entry.run(id, entry.trad, entry.simp, entry.kind, entry.freq);
    for (const alias of entry.aliases) insert.alias.run(id, alias.trad, alias.simp);
    // Readings that differ only in tone share keys; each (key, type) is stored once per entry.
    const keysSeen = new Set<string>();
    for (const r of entry.readings) {
      insert.reading.run(id, r.jyutping, r.rank ?? null, r.source, loanColumn(r.loan));
      for (const { key, type } of searchKeys(r.jyutping)) {
        if (keysSeen.has(`${type} ${key}`)) continue;
        keysSeen.add(`${type} ${key}`);
        insert.searchKey.run(key, id, type);
      }
    }
    for (const m of entry.mandarin) insert.mandarin.run(id, m.trad, m.simp, m.sources.join(","));
    for (const d of entry.definitions) {
      insert.definition.run(id, d.sense, d.pos ?? null, d.yue ?? null, d.yueSimp ?? null, d.zho ?? null, d.zhoSimp ?? null, d.source);
    }
    for (const x of entry.examples) {
      insert.example.run(id, x.sense, x.yueTrad, x.yueSimp, x.jyutping ?? null, loanColumn(x.loan), x.zho ?? null, x.zhoSimp ?? null, x.source);
    }
  });
}

function insertPhrases(db: Database.Database, phrases: readonly PhraseRow[]): void {
  const insert = db.prepare("INSERT INTO phrase_map (mandarin_trad, cantonese_trad, source) VALUES (?, ?, ?)");
  for (const p of phrases) insert.run(p.mandarinTrad, p.cantoneseTrad, p.source);
}

/**
 * Writes `entries` to a new SQLite database at `path` (replacing it), ids 1, 2, … in the order given,
 * and `phrases` to phrase_map.
 */
export function writeDb(path: string, entries: readonly Entry[], phrases: readonly PhraseRow[] = []): void {
  const temp = tempPathFor(path);
  const db = new Database(temp);
  try {
    db.transaction(() => {
      db.exec(SCHEMA);
      insertAll(db, entries);
      insertPhrases(db, phrases);
    })();
    db.exec("VACUUM");
    db.close();
    renameSync(temp, path);
  } catch (error) {
    if (db.open) db.close();
    if (existsSync(temp)) rmSync(temp);
    throw error;
  }
}
