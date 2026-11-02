// The offline translator's phrase table (spec §4.5, §6.1): Mandarin → Cantonese pairs reversed from
// Kaifangcidian and Wiktionary, merged with the hand-checked list in src/translate/offline/curated.ts.
// writeDb stores it as canto.db's phrase_map; the app substitutes by longest match over its keys after
// OpenCC s2t (P3-T4). Pure: no I/O.
import OpenCC from "opencc-js";
import { byCodeUnits } from "../compare";
import { IDEOGRAPHIC_DESCRIPTION, KFCD_PLACEHOLDER, cleanKfcdItem } from "../merge/merge";
import { headwordKey, toSimplified } from "../merge/normalize";
import type { Entry, MergeInputs } from "../merge/types";
import { CURATED_PAIRS, type CuratedPair } from "../../../src/translate/offline/curated";

/** Where a phrase_map row came from (its `source` column), in priority order: the first wins a key. */
export const PHRASE_SOURCES = ["curated", "wiktionary", "kaifangcidian"] as const;

export type PhraseSource = (typeof PHRASE_SOURCES)[number];

/** One phrase_map row. */
export interface PhraseRow {
  /** The Mandarin key as the app's toTrad (OpenCC cn→t) spells it. Unique. */
  readonly mandarinTrad: string;
  /** The Cantonese replacement, in canto.db's displayed spelling when it has an entry. */
  readonly cantoneseTrad: string;
  readonly source: PhraseSource;
}

/** What the build report prints about the phrase table. */
export interface PhraseTableStats {
  readonly rows: Readonly<Record<PhraseSource, number>>;
  /** Rows whose Cantonese is the Mandarin word (same headword key): kept to shield words in longest match. */
  readonly identityRows: number;
  /** Wiktionary Cantonese forms skipped for carrying a usage note (dated, slang, †, …). */
  readonly wiktionaryNotedForms: number;
  /** Wiktionary forms without a note skipped for a "…" placeholder in the form or its Mandarin word (話……知). */
  readonly wiktionaryPatternForms: number;
  /** Kaifangcidian Mandarin items skipped for a "…" placeholder (又…又…). */
  readonly kaifangcidianPatternItems: number;
  /** Source pairs skipped because their Mandarin key is one character (only curated keys may be). */
  readonly singleCharacterKeys: number;
  /** Keys left out because the Mandarin word is more frequent in canto.db than every source candidate (問題, not 阻滯). */
  readonly lessFrequentKeys: number;
  /** Curated Cantonese replacements canto.db has no entry for (Jyutping then reads them per word or character). */
  readonly curatedWithoutEntry: readonly string[];
}

export interface PhraseTable {
  /** Sorted by mandarinTrad in code-unit order. */
  readonly rows: PhraseRow[];
  readonly stats: PhraseTableStats;
}

/** The app's toTrad (src/translate/script.ts, its own opencc-js): keys must be spelled as it spells them. */
const SIMPLIFIED_TO_TRADITIONAL = OpenCC.Converter({ from: "cn", to: "t" });

/**
 * Source pairs need a Mandarin key of at least this many code points. A single character means too
 * many things to replace everywhere it is not shielded by a longer key: Wiktionary's 土 → 泥 would
 * turn 土地 into 泥地, Kaifangcidian's 凱 → 傾 every 凱. Curated single characters (的 → 嘅) are checked by hand.
 */
const MIN_SOURCE_KEY_LENGTH = 2;

const HAN = /\p{Script=Han}/u;

/** False for text substitution cannot use: no Han character (thank you, Benz) or an ideographic description (⿰血聿). */
const usableText = (text: string): boolean => HAN.test(text) && !IDEOGRAPHIC_DESCRIPTION.test(text);

/**
 * One Cantonese candidate for a key. Candidates compare by source priority, then `position` (the
 * form's index in its Wiktionary table, so editors' first-listed form wins; 0 for the other
 * sources), then the Cantonese entry's frequency (higher first; 0 without an entry), then code units.
 */
interface Candidate {
  readonly cantonese: string;
  readonly source: PhraseSource;
  readonly position: number;
  readonly freq: number;
}

const compareCandidates = (a: Candidate, b: Candidate): number =>
  PHRASE_SOURCES.indexOf(a.source) - PHRASE_SOURCES.indexOf(b.source) ||
  a.position - b.position ||
  b.freq - a.freq ||
  byCodeUnits(a.cantonese, b.cantonese);

/**
 * Builds the phrase table: one Cantonese replacement per Mandarin key, the best candidate by
 * compareCandidates (curated > Wiktionary > Kaifangcidian).
 *
 * - Keys: every Mandarin word goes through simplified and then OpenCC cn→t, as user input does in
 *   the app: curated Mandarin is simplified already, Kaifangcidian supplies its own simplified items
 *   (這裡 / 这里 → 這裏), and Wiktionary's traditional (Taiwan-form) words are simplified with
 *   toSimplified "zho-tw" first (著涼 → 着凉 → 着涼).
 * - Cantonese: the displayed spelling (`trad`) of the canto.db entry with the form's headword key
 *   (衛生 → 衞生), so Jyutping and the dictionary find it; the form as written when there is none.
 * - Wiktionary: only forms without a usage note (any note excludes the form: symbol notes such as
 *   † mean something different in each table).
 * - Kaifangcidian: items without their （…） annotations (cleanKfcdItem); "…" patterns (又…又…) are
 *   never used, nor Wiktionary forms with one.
 * - Source keys of one character are skipped (MIN_SOURCE_KEY_LENGTH); so is any text without a Han
 *   character or with an ideographic description character.
 * - Identity pairs (the Cantonese is the Mandarin word) are kept: in longest match 圖書館 → 圖書館 or
 *   curated 目的 → 目的 stops a shorter key (的 → 嘅) from rewriting the word.
 */
export function buildPhraseTable(
  sources: Pick<MergeInputs, "kaifangcidian" | "wiktionary">,
  entries: readonly Entry[],
  curated: readonly CuratedPair[] = CURATED_PAIRS,
): PhraseTable {
  const entryByKey = new Map(entries.map((e) => [e.key, e]));
  const candidates = new Map<string, Candidate[]>();
  let singleCharacterKeys = 0;

  /** Adds a candidate for the simplified Mandarin word `simplified`, unless either side is unusable. */
  const add = (simplified: string, cantonese: string, source: PhraseSource, position = 0): void => {
    const key = SIMPLIFIED_TO_TRADITIONAL(simplified);
    if (!usableText(key) || !usableText(cantonese)) return;
    if (source !== "curated" && [...key].length < MIN_SOURCE_KEY_LENGTH) {
      singleCharacterKeys++;
      return;
    }
    const entry = entryByKey.get(headwordKey(cantonese));
    const candidate: Candidate = { cantonese: entry?.trad ?? cantonese, source, position, freq: entry?.freq ?? 0 };
    const list = candidates.get(key);
    if (list === undefined) candidates.set(key, [candidate]);
    else list.push(candidate);
  };

  for (const [mandarin, cantonese] of curated) add(mandarin, cantonese, "curated");

  let wiktionaryNotedForms = 0;
  let wiktionaryPatternForms = 0;
  for (const pair of sources.wiktionary) {
    const simplified = toSimplified(pair.mandarin, "zho-tw");
    pair.cantonese.forEach(({ form, note }, position) => {
      if (note !== undefined) wiktionaryNotedForms++;
      else if (pair.mandarin.includes(KFCD_PLACEHOLDER) || form.includes(KFCD_PLACEHOLDER)) wiktionaryPatternForms++;
      else add(simplified, form, "wiktionary", position);
    });
  }

  let kaifangcidianPatternItems = 0;
  for (const row of sources.kaifangcidian) {
    for (const item of row.mandarin) {
      const simplified = cleanKfcdItem(item.simp);
      if (simplified.includes(KFCD_PLACEHOLDER)) kaifangcidianPatternItems++;
      else add(simplified, row.word, "kaifangcidian");
    }
  }

  let lessFrequentKeys = 0;
  const rows: PhraseRow[] = [];
  for (const [mandarinTrad, list] of [...candidates].sort(([a], [b]) => byCodeUnits(a, b))) {
    const mandarinFreq = entryByKey.get(headwordKey(mandarinTrad))?.freq ?? 0;
    const eligible = list.filter((c) => c.source === "curated" || c.freq >= mandarinFreq);
    if (eligible.length === 0) {
      lessFrequentKeys++;
      continue;
    }
    const best = eligible.reduce((a, b) => (compareCandidates(b, a) < 0 ? b : a));
    rows.push({ mandarinTrad, cantoneseTrad: best.cantonese, source: best.source });
  }

  const rowCounts = Object.fromEntries(PHRASE_SOURCES.map((s) => [s, 0])) as Record<PhraseSource, number>;
  for (const row of rows) rowCounts[row.source]++;
  const curatedWithoutEntry = [...new Set(curated.map(([, cantonese]) => cantonese))].filter((c) => !entryByKey.has(headwordKey(c)));
  return {
    rows,
    stats: {
      rows: rowCounts,
      identityRows: rows.filter((r) => headwordKey(r.mandarinTrad) === headwordKey(r.cantoneseTrad)).length,
      wiktionaryNotedForms,
      wiktionaryPatternForms,
      kaifangcidianPatternItems,
      singleCharacterKeys,
      lessFrequentKeys,
      curatedWithoutEntry,
    },
  };
}
