// Merge: a pure function from parsed source rows to Entry objects plus the stats the build report
// prints. No I/O here; loadMergeInputs (load.ts) gathers the inputs.
import type { CharReading, ReadingRank, WordReading } from "../sources/types";
import { isSingleCodePoint } from "../sources/codePoints";
import { headwordKey, toSimplified } from "./normalize";
import type { Entry, EntryReading, MergeInputs, MergeResult, MergeStats, RowSource } from "./types";

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

/** Everything gathered for one key before it becomes an Entry. */
class EntryBuilder {
  /** Each spelling the sources use for this key, with the sources that use it. */
  readonly spellings = new Map<string, Set<RowSource>>();
  readonly readings: ReadingCandidate[] = [];
  /** The lowest words.hk dump entry id that uses each dump spelling (the display tie-break). */
  readonly firstDumpId = new Map<string, number>();

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

/** Adds one to `counts[source]`. */
function count<K extends string>(counts: Partial<Record<K, number>>, source: K, by = 1): void {
  counts[source] = (counts[source] ?? 0) + by;
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

  const readingCounts: Partial<Record<RowSource, number>> = {};
  const collisions: { key: string; spellings: string[] }[] = [];
  const entries: Entry[] = [...builders.values()]
    .sort((a, b) => byCodeUnits(a.key, b.key))
    .map((builder) => {
      const trad = chooseTrad(builder);
      const spellings = [...builder.spellings.keys()].sort(byCodeUnits);
      if (spellings.length > 1) collisions.push({ key: builder.key, spellings });
      const readings = finishReadings(builder);
      for (const r of readings) count(readingCounts, r.source);
      return {
        key: builder.key,
        trad,
        simp: toSimplified(trad, "hk"),
        kind: isSingleCodePoint(trad) ? "char" : "word",
        freq: 0,
        aliases: spellings.filter((s) => s !== trad),
        readings,
        mandarin: [],
        definitions: [],
        examples: [],
      } satisfies Entry;
    });

  const stats: MergeStats = {
    omitted: [],
    entries: { char: entries.filter((e) => e.kind === "char").length, word: entries.filter((e) => e.kind === "word").length },
    rows: { readings: readingCounts, mandarin: {}, definitions: {}, examples: {} },
    unmatched: { kaifangcidianRows: 0, kaifangcidianWords: 0, kaifangcidianFrequent: [], wiktionaryForms: 0, moeEntries: 0 },
    keyCollisions: { keysWithSeveralSpellings: collisions.length, sample: collisions.slice(0, STATS_SAMPLE_SIZE) },
    variants: { listRows: 0, listWords: 0, linkedWords: 0, droppedRows: 0, droppedWords: 0, droppedButKeyMatched: 0, aliasesFromLinks: 0 },
    kaifangcidian: { annotationsRemoved: 0, emptyItemsDropped: 0 },
    wiktionary: { notedFormsSkipped: 0, identityPairsSkipped: 0 },
    moe: { sensesDropped: 0, droppedSample: [], shadowedEntries: 0 },
    freq: { entriesWithFreq: 0, overridesUsed: [], overridesUnused: [] },
  };
  return { entries, stats };
}
