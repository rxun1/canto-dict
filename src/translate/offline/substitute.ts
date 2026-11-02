// Offline translation step 2 (spec §6): longest-match phrase replacement over phrase_map, after
// toTrad and before the reorder rules.
import { loadPhraseMap } from "../../db/phraseMap";
import type { Db } from "../../db/types";

export interface PhraseTable {
  /** Mandarin (traditional, as toTrad gives it) → Cantonese. */
  readonly phrases: ReadonlyMap<string, string>;
  /** The longest key, in characters (code points): no longer substring can match. */
  readonly maxKeyLength: number;
}

export function createPhraseTable(phrases: ReadonlyMap<string, string>): PhraseTable {
  let maxKeyLength = 0;
  for (const key of phrases.keys()) maxKeyLength = Math.max(maxKeyLength, Array.from(key).length);
  return { phrases, maxKeyLength };
}

// One load per Db (canto.db is read-only, so the table never changes while it is open). A failed
// load is forgotten, so the next call tries again.
const tables = new WeakMap<Db, Promise<PhraseTable>>();

/** canto.db's phrase table, loaded on the first call for `db` and reused after. */
export function phraseTable(db: Db): Promise<PhraseTable> {
  let table = tables.get(db);
  if (!table) {
    table = loadPhraseMap(db).then(createPhraseTable);
    table.catch(() => tables.delete(db));
    tables.set(db, table);
  }
  return table;
}

/**
 * Replaces phrases in `text` (traditional: run toTrad first), left to right, each time with the
 * longest key that starts there; characters no key starts with stay as they are. Pure: no DB access.
 */
export function substitute(table: PhraseTable, text: string): string {
  const chars = Array.from(text);

  /** The longest key starting at `start` and its length, or null. */
  const longestMatchAt = (start: number): { replacement: string; length: number } | null => {
    for (let length = Math.min(table.maxKeyLength, chars.length - start); length >= 1; length--) {
      const replacement = table.phrases.get(chars.slice(start, start + length).join(""));
      if (replacement !== undefined) return { replacement, length };
    }
    return null;
  };

  let result = "";
  let start = 0;
  while (start < chars.length) {
    const match = longestMatchAt(start);
    result += match ? match.replacement : chars[start];
    start += match ? match.length : 1;
  }
  return result;
}
