// Lookup search over canto.db (spec §5.1). Matching and ranking both run in SQL, so only the top
// `limit` rows leave SQLite: one query per search, with each row's reading and gloss filled in by
// subqueries over those rows only (no per-row round trips).
//
// Ranking: match quality (exact > prefix > contains) → freq → shorter headword → id (stable ties).
// Character queries also put a same-case exact match before a case-folded one (AA制 before aa制
// for "AA制").
import { TONE_CLASS, TONE_DIGIT } from "../jyutping/pattern";
import type { Db, SqlParam } from "./types";

export type MatchQuality = "exact" | "prefix" | "contains";

/** A short Mandarin line for a result row, in spec §5.2's fallback order. */
export interface Gloss {
  /** mandarin: first equivalent; zho: first MoE definition; yue: first words.hk explanation (粤语释义). */
  source: "mandarin" | "zho" | "yue";
  trad: string;
  simp: string;
}

export interface SearchResult {
  id: number;
  trad: string;
  simp: string;
  match: MatchQuality;
  /**
   * For a Jyutping query, the entry's first reading the query prefix-matches (行 shows hong4 for
   * "hong"); otherwise, or when none does, its first reading. Null when it has none.
   */
  jyutping: string | null;
  gloss: Gloss | null;
}

/** A Jyutping query: classify()'s jyutping result fits. */
export interface JyutpingQuery {
  /** Lowercase, each with its tone digit if typed. */
  syllables: readonly string[];
  /** The syllables joined without spaces. */
  key: string;
  toneless: boolean;
}

const QUALITIES: readonly MatchQuality[] = ["exact", "prefix", "contains"];

// LIKE is case-insensitive for ASCII letters (SQLite's default, also in expo-sqlite), which is how
// character queries compare Latin letters (aa制 finds AA制). Wildcards in the query are escaped.
const LIKE_ESCAPE = "\\";
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => LIKE_ESCAPE + c);

// Every ranked CTE yields id, trad, simp, freq, quality (index into QUALITIES), exact_case and
// reading_pattern (a GLOB over a reading with spaces removed, or NULL); the outer query orders them
// again because a CTE's order does not carry over.
const ORDER_BY = "quality, exact_case DESC, freq DESC, length(trad), id";

const RESULT_COLUMNS = `
  id, trad, simp, quality,
  COALESCE(
    (SELECT jyutping FROM readings WHERE entry_id = ranked.id AND replace(jyutping, ' ', '') GLOB reading_pattern ORDER BY rowid LIMIT 1),
    (SELECT jyutping FROM readings WHERE entry_id = ranked.id ORDER BY rowid LIMIT 1)
  ) AS jyutping,
  (SELECT word_trad FROM mandarin WHERE entry_id = ranked.id ORDER BY rowid LIMIT 1) AS mandarinTrad,
  (SELECT word_simp FROM mandarin WHERE entry_id = ranked.id ORDER BY rowid LIMIT 1) AS mandarinSimp,
  (SELECT zho FROM definitions WHERE entry_id = ranked.id AND zho IS NOT NULL ORDER BY rowid LIMIT 1) AS zho,
  (SELECT zho_simp FROM definitions WHERE entry_id = ranked.id AND zho IS NOT NULL ORDER BY rowid LIMIT 1) AS zhoSimp,
  (SELECT yue FROM definitions WHERE entry_id = ranked.id AND yue IS NOT NULL ORDER BY rowid LIMIT 1) AS yue,
  (SELECT yue_simp FROM definitions WHERE entry_id = ranked.id AND yue IS NOT NULL ORDER BY rowid LIMIT 1) AS yueSimp`;

type ResultRow = Pick<SearchResult, "id" | "trad" | "simp" | "jyutping"> & {
  quality: number;
  mandarinTrad: string | null;
  mandarinSimp: string | null;
  zho: string | null;
  zhoSimp: string | null;
  yue: string | null;
  yueSimp: string | null;
};

function toGloss(row: ResultRow): Gloss | null {
  if (row.mandarinTrad !== null && row.mandarinSimp !== null) return { source: "mandarin", trad: row.mandarinTrad, simp: row.mandarinSimp };
  if (row.zho !== null && row.zhoSimp !== null) return { source: "zho", trad: row.zho, simp: row.zhoSimp };
  if (row.yue !== null && row.yueSimp !== null) return { source: "yue", trad: row.yue, simp: row.yueSimp };
  return null;
}

/** Wraps a ranked CTE (ending in LIMIT ?) with the row columns and runs it. */
async function runRanked(db: Db, ctes: string, params: readonly SqlParam[]): Promise<SearchResult[]> {
  const rows = await db.all<ResultRow>(`WITH ${ctes} SELECT ${RESULT_COLUMNS} FROM ranked ORDER BY ${ORDER_BY}`, params);
  return rows.map((row) => ({
    id: row.id,
    trad: row.trad,
    simp: row.simp,
    match: QUALITIES[row.quality],
    jyutping: row.jyutping,
    gloss: toGloss(row),
  }));
}

/**
 * Character search: exact (trad or simp of the entry or one of its aliases) → prefix → contains
 * (of trad or simp). Contains needs a scan of entries, so exact and prefix ride on the same scan.
 */
export function searchHanzi(db: Db, text: string, limit: number): Promise<SearchResult[]> {
  const like = escapeLike(text);
  const matches = (column: string, pattern: string) => `${column} LIKE ${pattern} ESCAPE '${LIKE_ESCAPE}'`;
  const ctes = `
    p AS (SELECT ? AS text, ? AS exact, ? AS prefix, ? AS contains),
    alias_hits AS (SELECT a.entry_id FROM aliases a, p WHERE ${matches("a.trad", "p.exact")} OR ${matches("a.simp", "p.exact")}),
    ranked AS (
      SELECT e.id, e.trad, e.simp, e.freq,
        CASE
          WHEN ${matches("e.trad", "p.exact")} OR ${matches("e.simp", "p.exact")} OR e.id IN alias_hits THEN 0
          WHEN ${matches("e.trad", "p.prefix")} OR ${matches("e.simp", "p.prefix")} THEN 1
          ELSE 2
        END AS quality,
        (e.trad = p.text OR e.simp = p.text) AS exact_case,
        NULL AS reading_pattern
      FROM entries e, p
      WHERE ${matches("e.trad", "p.contains")} OR ${matches("e.simp", "p.contains")} OR e.id IN alias_hits
      ORDER BY ${ORDER_BY}
      LIMIT ?
    )`;
  return runRanked(db, ctes, [text, like, `${like}%`, `%${like}%`, limit]);
}

/**
 * GLOB over a reading with its spaces removed: each typed syllable as typed, a toneless one with any
 * tone. A reading split differently from the query (rare) does not match; it then counts as a
 * prefix match and shows its first reading.
 */
const readingGlob = (syllables: readonly string[]) =>
  syllables.map((s) => (TONE_DIGIT.test(s.slice(-1)) ? s : s + TONE_CLASS)).join("");

/**
 * Jyutping search: prefix on search_keys.key (toneless keys only for a toneless query). A hit is
 * exact when one of the entry's readings, spaces removed, is the query; not when key = query, since
 * a key can be a truncated reading (searchKeys.ts). Keys hold only [a-z1-6], so the LIKE needs no
 * escaping, and binding it directly (not through a CTE column) lets SQLite use search_keys_key.
 */
export function searchJyutping(db: Db, query: JyutpingQuery, limit: number): Promise<SearchResult[]> {
  const exact = readingGlob(query.syllables);
  // A reading the query is a prefix of. The last syllable is left open (sik matches sik6 faan6).
  const prefix = readingGlob(query.syllables.slice(0, -1)) + query.syllables[query.syllables.length - 1] + "*";
  const ctes = `
    hits AS (
      SELECT DISTINCT entry_id FROM search_keys
      WHERE key LIKE ? ${query.toneless ? "AND type = 'toneless'" : ""}
    ),
    ranked AS (
      SELECT e.id, e.trad, e.simp, e.freq,
        CASE WHEN EXISTS (
          SELECT 1 FROM readings r WHERE r.entry_id = e.id AND replace(r.jyutping, ' ', '') GLOB ?
        ) THEN 0 ELSE 1 END AS quality,
        1 AS exact_case,
        ? AS reading_pattern
      FROM hits JOIN entries e ON e.id = hits.entry_id
      ORDER BY ${ORDER_BY}
      LIMIT ?
    )`;
  return runRanked(db, ctes, [`${query.key}%`, exact, prefix, limit]);
}
