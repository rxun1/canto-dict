// The offline translator's phrase table (phrase_map, built by data-pipeline/src/build/phraseTable.ts).
import type { Db } from "./types";

/** Every phrase_map row as Mandarin (OpenCC cn→t, as toTrad gives it) → Cantonese, in one query. */
export async function loadPhraseMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.all<{ mandarin: string; cantonese: string }>(
    "SELECT mandarin_trad AS mandarin, cantonese_trad AS cantonese FROM phrase_map",
  );
  return new Map(rows.map(({ mandarin, cantonese }) => [mandarin, cantonese]));
}
