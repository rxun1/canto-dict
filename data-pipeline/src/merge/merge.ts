// Merge: a pure function from parsed source rows to Entry objects plus the stats the build report
// prints. No I/O here; loadMergeInputs (load.ts) gathers the inputs.
import type { CharReading, ReadingRank } from "../sources/types";
import { headwordKey, toSimplified } from "./normalize";
import type { Entry, EntryReading, MergeInputs, MergeResult, MergeStats, RowSource } from "./types";

/** Reading sources in priority order: rime > LSHK > Unihan for characters (spec §4.1). */
const READING_SOURCE_PRIORITY: readonly RowSource[] = ["rime", "lshk", "unihan"];

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
}

/** Everything gathered for one key before it becomes an Entry. */
class EntryBuilder {
  /** Each spelling the sources use for this key, with the sources that use it. */
  readonly spellings = new Map<string, Set<RowSource>>();
  readonly readings: ReadingCandidate[] = [];

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
  const kept = new Map<string, EntryReading>();
  for (const candidate of ordered) {
    if (kept.has(candidate.jyutping)) continue;
    const rank = candidate.source === "rime" ? candidate.rank : rimeCovers ? "variant" : undefined;
    kept.set(candidate.jyutping, {
      jyutping: candidate.jyutping,
      ...(rank !== undefined && { rank }),
      source: candidate.source,
    });
  }
  return [...kept.values()];
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

  const readingCounts: Partial<Record<RowSource, number>> = {};
  const entries: Entry[] = [...builders.values()]
    .sort((a, b) => byCodeUnits(a.key, b.key))
    .map((builder) => {
      const trad = builder.key;
      const readings = finishReadings(builder);
      for (const r of readings) count(readingCounts, r.source);
      return {
        key: builder.key,
        trad,
        simp: toSimplified(trad, "hk"),
        kind: "char",
        freq: 0,
        aliases: [],
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
    keyCollisions: { keysWithSeveralSpellings: 0, sample: [] },
    variants: { listRows: 0, listWords: 0, linkedWords: 0, droppedRows: 0, droppedWords: 0, droppedButKeyMatched: 0, aliasesFromLinks: 0 },
    kaifangcidian: { annotationsRemoved: 0, emptyItemsDropped: 0 },
    wiktionary: { notedFormsSkipped: 0, identityPairsSkipped: 0 },
    moe: { sensesDropped: 0, droppedSample: [], shadowedEntries: 0 },
    freq: { entriesWithFreq: 0, overridesUsed: [], overridesUnused: [] },
  };
  return { entries, stats };
}
