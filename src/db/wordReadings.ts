// Word readings for text → Jyutping (src/translate/jyutping.ts): every reading of the words given,
// matched by headword or alias spelling, in one query per chunk of words.
import type { Db } from "./types";

/**
 * Bound parameters per statement: SQLite's default before 3.32 (SQLITE_MAX_VARIABLE_NUMBER), so any
 * SQLite build accepts it.
 */
const MAX_SQL_PARAMS = 999;
// Each word is bound twice, once for headwords and once for aliases.
const WORDS_PER_QUERY = Math.floor(MAX_SQL_PARAMS / 2);

/**
 * Every reading of each word found, best first: a headword match before an alias match, then the
 * more frequent entry, then the entry's reading order (rowid). Words with no entry are left out.
 */
export async function getWordReadings(db: Db, words: readonly string[]): Promise<Map<string, string[]>> {
  const readings = new Map<string, string[]>();
  for (let start = 0; start < words.length; start += WORDS_PER_QUERY) {
    const chunk = words.slice(start, start + WORDS_PER_QUERY);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db.all<{ word: string; jyutping: string }>(
      `SELECT word, jyutping FROM (
         SELECT e.trad AS word, r.jyutping, 0 AS via_alias, e.freq, e.id, r.rowid AS reading
           FROM entries e JOIN readings r ON r.entry_id = e.id WHERE e.trad IN (${placeholders})
         UNION ALL
         SELECT a.trad, r.jyutping, 1, e.freq, e.id, r.rowid
           FROM aliases a JOIN entries e ON e.id = a.entry_id JOIN readings r ON r.entry_id = e.id
           WHERE a.trad IN (${placeholders})
       ) ORDER BY via_alias, freq DESC, id, reading`,
      [...chunk, ...chunk],
    );
    for (const { word, jyutping } of rows) {
      const list = readings.get(word);
      if (list) list.push(jyutping);
      else readings.set(word, [jyutping]);
    }
  }
  return readings;
}
