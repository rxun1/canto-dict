// Merge: a pure function from parsed source rows to Entry objects plus the stats the build report
// prints. No I/O here; loadMergeInputs (load.ts) gathers the inputs.
import type { CharReading, KfcdRow, MandarinEquivalent, ReadingRank, WordReading } from "../sources/types";
import { isSingleCodePoint } from "../sources/codePoints";
import { headwordKey, toSimplified } from "./normalize";
import type { Entry, EntryReading, MandarinItem, MergeInputs, MergeResult, MergeStats, RowSource, WordCount } from "./types";

/**
 * Reading sources in priority order: rime > LSHK > Unihan for characters (spec §4.1), then words.hk
 * (its list before its dump). Word readings come from rime words, the list and dump headwords, in
 * that order; a one-character words.hk headword adds to its character entry.
 */
const READING_SOURCE_PRIORITY: readonly RowSource[] = ["rime", "lshk", "unihan", "wordshk-list", "wordshk-dump"];

/** Sources whose spelling is displayed, in preference order: words.hk (HK forms), then rime, then the others. */
const DISPLAY_SOURCE_PRIORITY: readonly RowSource[] = ["wordshk-dump", "wordshk-list", "rime", "lshk", "unihan"];

/** How many items report samples list. */
export const STATS_SAMPLE_SIZE = 20;

/** Readings sort by rank in this order within a source; unranked readings come last. */
const RANK_ORDER: readonly ReadingRank[] = ["default", "common", "rare", "obsolete", "variant"];

/**
 * A full-width parenthetical in a Kaifangcidian Mandarin item: a register label such as （婉）
 * (euphemism) in （婉）性交, or an object hint such as （房子） in 蓋（房子）. Neither is part of the
 * Mandarin word, so it is removed (KFCD is CC BY, not ND, so cleaning is allowed).
 */
const KFCD_ANNOTATION = /（[^）]*）/g;

/** Code-unit order: deterministic and locale-independent. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const rankIndex = (rank: ReadingRank | undefined): number => (rank === undefined ? RANK_ORDER.length : RANK_ORDER.indexOf(rank));

/** A reading as one source gives it, before de-duplication. */
interface ReadingCandidate {
  readonly jyutping: string;
  readonly rank?: ReadingRank;
  readonly source: RowSource;
  readonly loan?: readonly number[];
}

/**
 * A Kaifangcidian Mandarin item without its （…） annotations (（婉）性交 → 性交, 蓋（房子） → 蓋), or ""
 * when nothing else is left. "…" placeholders are kept: in items such as 又…又… (兼夾) or 就…吧 the
 * pattern is the meaning, and Kaifangcidian has 68 such items.
 */
export function cleanKfcdItem(item: string): string {
  return item.replace(KFCD_ANNOTATION, "").trim();
}

/** A Kaifangcidian row reduced to what merge keeps: cleaned Mandarin items and a content sort key. */
interface KfcdAttachment {
  /** Syllables, then the raw items: rows repeated per sense sort the same whatever the input order. */
  readonly sortKey: string;
  readonly mandarin: readonly MandarinEquivalent[];
}

/** Everything gathered for one key before it becomes an Entry. */
class EntryBuilder {
  /** Each spelling the sources use for this key, with the sources that use it. */
  readonly spellings = new Map<string, Set<RowSource>>();
  readonly readings: ReadingCandidate[] = [];
  /** The lowest words.hk dump entry id that uses each dump spelling (the display tie-break). */
  readonly firstDumpId = new Map<string, number>();
  readonly kfcd: KfcdAttachment[] = [];
  /** Mandarin words Wiktionary gives this entry as a Cantonese form of (reversed pairs). */
  readonly wiktionary: string[] = [];

  constructor(readonly key: string) {}

  addSpelling(spelling: string, source: RowSource): void {
    let sources = this.spellings.get(spelling);
    if (sources === undefined) this.spellings.set(spelling, (sources = new Set()));
    sources.add(source);
  }

  spelledBy(source: RowSource): string[] {
    return [...this.spellings].filter(([, sources]) => sources.has(source)).map(([spelling]) => spelling).sort(byCodeUnits);
  }
}

/**
 * Readings de-duplicated by Jyutping in priority order. Sources come in READING_SOURCE_PRIORITY
 * order and, within a source, by rank then Jyutping, so input order never matters. A character rime
 * covers keeps rime's ranks, and another source's reading rime lacks becomes "variant"; a character
 * rime lacks gets unranked readings. Nothing is ever promoted to default.
 */
function finishReadings(builder: EntryBuilder): EntryReading[] {
  const rimeCovers = builder.readings.some((r) => r.source === "rime");
  const ordered = [...builder.readings].sort(
    (a, b) =>
      READING_SOURCE_PRIORITY.indexOf(a.source) - READING_SOURCE_PRIORITY.indexOf(b.source) ||
      rankIndex(a.rank) - rankIndex(b.rank) ||
      byCodeUnits(a.jyutping, b.jyutping),
  );
  const isChar = isSingleCodePoint(builder.key);
  const kept = new Map<string, { reading: EntryReading; loan: Set<number> }>();
  for (const candidate of ordered) {
    const loan = kept.get(candidate.jyutping)?.loan ?? new Set<number>();
    // A loan mark from any source applies to those syllables wherever they appear.
    for (const index of candidate.loan ?? []) loan.add(index);
    if (kept.has(candidate.jyutping)) continue;
    const rank = candidate.source === "rime" ? candidate.rank : isChar && rimeCovers ? "variant" : undefined;
    kept.set(candidate.jyutping, {
      reading: { jyutping: candidate.jyutping, ...(rank !== undefined && { rank }), source: candidate.source },
      loan,
    });
  }
  return [...kept.values()].map(({ reading, loan }) =>
    loan.size === 0 ? reading : { ...reading, loan: [...loan].sort((a, b) => a - b) },
  );
}

/**
 * The displayed traditional headword: a words.hk spelling when there is one (a dump headword before
 * a list word, the lowest dump id first), else rime's, else LSHK's or Unihan's; ties go to code-unit order.
 */
function chooseTrad(builder: EntryBuilder): string {
  for (const source of DISPLAY_SOURCE_PRIORITY) {
    const spellings = builder.spelledBy(source);
    if (source === "wordshk-dump") {
      spellings.sort((a, b) => builder.firstDumpId.get(a)! - builder.firstDumpId.get(b)! || byCodeUnits(a, b));
    }
    if (spellings.length > 0) return spellings[0];
  }
  throw new Error(`merge: entry ${builder.key} has no spelling from an entry-creating source`);
}

/**
 * Mandarin items: Kaifangcidian's (rows in content order, items in row order), then Wiktionary's
 * (in code-unit order), de-duplicated on (trad, simp) with their sources merged. Wiktionary gives
 * traditional only (Taiwan forms such as 著涼), so its simplified form comes from OpenCC tw→cn.
 */
function finishMandarin(builder: EntryBuilder): MandarinItem[] {
  const items = new Map<string, { trad: string; simp: string; sources: RowSource[] }>();
  const add = (trad: string, simp: string, source: RowSource): void => {
    const pairKey = `${trad}\t${simp}`;
    let item = items.get(pairKey);
    if (item === undefined) items.set(pairKey, (item = { trad, simp, sources: [] }));
    if (!item.sources.includes(source)) item.sources.push(source);
  };
  for (const row of [...builder.kfcd].sort((a, b) => byCodeUnits(a.sortKey, b.sortKey))) {
    for (const { trad, simp } of row.mandarin) add(trad, simp, "kaifangcidian");
  }
  for (const word of [...builder.wiktionary].sort(byCodeUnits)) add(word, toSimplified(word, "tw"), "wiktionary");
  return [...items.values()];
}

/** Adds one to `counts[source]`. */
function count<K extends string>(counts: Partial<Record<K, number>>, source: K, by = 1): void {
  counts[source] = (counts[source] ?? 0) + by;
}

const kfcdSortKey = (row: KfcdRow): string =>
  [row.syllables.join(" "), ...row.mandarin.map(({ trad, simp }) => `${trad}/${simp}`)].join("\t");

/** The words with an essay weight, heaviest first (ties in code-unit order), at most STATS_SAMPLE_SIZE. */
function mostFrequent(words: Iterable<string>, weights: ReadonlyMap<string, number>): WordCount[] {
  return [...words]
    .flatMap((word) => {
      const weight = weights.get(word);
      return weight === undefined ? [] : [{ word, count: weight }];
    })
    .sort((a, b) => b.count - a.count || byCodeUnits(a.word, b.word))
    .slice(0, STATS_SAMPLE_SIZE);
}

export function merge(inputs: MergeInputs): MergeResult {
  const builders = new Map<string, EntryBuilder>();
  const builderFor = (key: string): EntryBuilder => {
    let builder = builders.get(key);
    if (builder === undefined) builders.set(key, (builder = new EntryBuilder(key)));
    return builder;
  };

  const charSources: [RowSource, readonly CharReading[]][] = [
    ["rime", inputs.rimeChars],
    ["lshk", inputs.lshk],
    ["unihan", inputs.unihan],
  ];
  for (const [source, rows] of charSources) {
    for (const row of rows) {
      const builder = builderFor(headwordKey(row.char));
      builder.addSpelling(row.char, source);
      builder.readings.push({ jyutping: row.jyutping, rank: row.rank, source });
    }
  }

  const addWordReading = (row: Pick<WordReading, "word" | "syllables" | "loanSyllables">, source: RowSource): EntryBuilder => {
    const builder = builderFor(headwordKey(row.word));
    builder.addSpelling(row.word, source);
    builder.readings.push({
      jyutping: row.syllables.join(" "),
      source,
      ...(row.loanSyllables !== undefined && { loan: row.loanSyllables }),
    });
    return builder;
  };
  for (const row of inputs.rimeWords) addWordReading(row, "rime");
  // variantForm rows (㨂 for 揀) never become headwords; they fold in as aliases through dump links.
  for (const row of inputs.wordshkList) if (row.variantForm !== true) addWordReading(row, "wordshk-list");
  for (const dumpEntry of inputs.wordshkDump ?? []) {
    for (const headword of dumpEntry.headwords) {
      const builder = addWordReading(headword, "wordshk-dump");
      const first = builder.firstDumpId.get(headword.word);
      if (first === undefined || dumpEntry.id < first) builder.firstDumpId.set(headword.word, dumpEntry.id);
    }
  }

  // Attach-only sources: they add to existing entries and never create one.
  const weights = new Map(inputs.essay.map(({ word, weight }) => [word, weight]));
  const kfcdStats = { annotationsRemoved: 0, emptyItemsDropped: 0 };
  let kfcdUnmatchedRows = 0;
  const kfcdUnmatchedWords = new Set<string>();
  for (const row of inputs.kaifangcidian) {
    const mandarin: MandarinEquivalent[] = [];
    for (const item of row.mandarin) {
      const trad = cleanKfcdItem(item.trad);
      const simp = cleanKfcdItem(item.simp);
      if (trad !== item.trad || simp !== item.simp) kfcdStats.annotationsRemoved++;
      if (trad === "" || simp === "") kfcdStats.emptyItemsDropped++;
      else mandarin.push({ trad, simp });
    }
    const builder = builders.get(headwordKey(row.word));
    if (builder === undefined) {
      kfcdUnmatchedRows++;
      kfcdUnmatchedWords.add(row.word);
      continue;
    }
    builder.addSpelling(row.word, "kaifangcidian");
    builder.kfcd.push({ sortKey: kfcdSortKey(row), mandarin });
  }

  const wiktStats = { notedFormsSkipped: 0, identityPairsSkipped: 0 };
  const wiktUnmatchedForms = new Set<string>();
  for (const pair of inputs.wiktionary) {
    const mandarinKey = headwordKey(pair.mandarin);
    for (const { form, note } of pair.cantonese) {
      if (note !== undefined) {
        wiktStats.notedFormsSkipped++;
        continue;
      }
      const key = headwordKey(form);
      if (key === mandarinKey) {
        wiktStats.identityPairsSkipped++;
        continue;
      }
      const builder = builders.get(key);
      if (builder === undefined) {
        wiktUnmatchedForms.add(form);
        continue;
      }
      builder.addSpelling(form, "wiktionary");
      builder.wiktionary.push(pair.mandarin);
    }
  }

  const readingCounts: Partial<Record<RowSource, number>> = {};
  const mandarinCounts: Partial<Record<RowSource, number>> = {};
  const collisions: { key: string; spellings: string[] }[] = [];
  const entries: Entry[] = [...builders.values()]
    .sort((a, b) => byCodeUnits(a.key, b.key))
    .map((builder) => {
      const trad = chooseTrad(builder);
      const spellings = [...builder.spellings.keys()].sort(byCodeUnits);
      if (spellings.length > 1) collisions.push({ key: builder.key, spellings });
      const readings = finishReadings(builder);
      for (const r of readings) count(readingCounts, r.source);
      const mandarin = finishMandarin(builder);
      for (const item of mandarin) for (const source of item.sources) count(mandarinCounts, source);
      return {
        key: builder.key,
        trad,
        simp: toSimplified(trad, "hk"),
        kind: isSingleCodePoint(trad) ? "char" : "word",
        freq: 0,
        aliases: spellings.filter((s) => s !== trad),
        readings,
        mandarin,
        definitions: [],
        examples: [],
      } satisfies Entry;
    });

  const stats: MergeStats = {
    omitted: [],
    entries: { char: entries.filter((e) => e.kind === "char").length, word: entries.filter((e) => e.kind === "word").length },
    rows: { readings: readingCounts, mandarin: mandarinCounts, definitions: {}, examples: {} },
    unmatched: {
      kaifangcidianRows: kfcdUnmatchedRows,
      kaifangcidianWords: kfcdUnmatchedWords.size,
      kaifangcidianFrequent: mostFrequent(kfcdUnmatchedWords, weights),
      wiktionaryForms: wiktUnmatchedForms.size,
      moeEntries: 0,
    },
    keyCollisions: { keysWithSeveralSpellings: collisions.length, sample: collisions.slice(0, STATS_SAMPLE_SIZE) },
    variants: { listRows: 0, listWords: 0, linkedWords: 0, droppedRows: 0, droppedWords: 0, droppedButKeyMatched: 0, aliasesFromLinks: 0 },
    kaifangcidian: kfcdStats,
    wiktionary: wiktStats,
    moe: { sensesDropped: 0, droppedSample: [], shadowedEntries: 0 },
    freq: { entriesWithFreq: 0, overridesUsed: [], overridesUnused: [] },
  };
  return { entries, stats };
}
