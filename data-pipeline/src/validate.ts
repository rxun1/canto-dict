// Build validation (spec §4.2, §4.6): runs after merge and before any asset is written, so a failed
// check stops the build with the previous canto.db, audio pack and report still in place. validate()
// only reads its arguments and throws; it writes nothing.
import { TONED_SYLLABLE } from "../../src/jyutping/pattern";
import { isValidSyllable } from "../../src/jyutping/syllables";
import type { Entry, MergeInputs } from "./merge/types";
import { describeBadSyllable } from "./sources/jyutpingCell";
import { throwIfProblems, type Problem } from "./sources/problems";

/** What validate counts: each parsed source's rows, plus the syllable audio clips. */
export type CountedSource = keyof MergeInputs | "audioClips";

export type SourceRows = Readonly<Record<CountedSource, number>>;

/**
 * Fewest rows each source may have. A source far below its real size means a truncated download, a
 * changed format or a parser that silently drops rows. Each minimum sits ~15–25% under the row count
 * the pinned source parses to (dashboard log P1-T4 – P1-T11, P1-T15; docs/research/lexical-datasets.html
 * and audio-datasets.html give the upstream sizes), so ordinary upstream edits still pass.
 */
export const MIN_SOURCE_ROWS: SourceRows = {
  /** rime char.csv: 34,362 readings of 27,007 characters. */
  rimeChars: 25_000,
  /** LSHK list.tsv: 38,194 readings (research: 38,305 rows, 29,144 characters). */
  lshk: 30_000,
  /** Unihan kCantonese: 29,929 readings (research: 29,936 characters). */
  unihan: 25_000,
  /** rime words dict: 102,378 readings kept (research: 103,077 rows). */
  rimeWords: 90_000,
  /** words.hk word list: 64,652 readings (research: 62,634 headwords). */
  wordshkList: 55_000,
  /** words.hk dump (optional, checked only when supplied): 16,711 public entries. */
  wordshkDump: 14_000,
  /** Kaifangcidian: 72,543 rows (the site reports 84,783 words). */
  kaifangcidian: 60_000,
  /** Wiktionary dial-syn: 6,078 Mandarin → Cantonese pairs from 3,768 tables. */
  wiktionary: 5_000,
  /** MoE 國語辭典 重編本: 161,007 headwords. */
  moe: 140_000,
  /** rime essay-cantonese: 266,864 weighted words. */
  essay: 230_000,
  /** words.hk syllable clips: 3,902 files. */
  audioClips: 3_500,
};

/** Minimums that never fail: for builds from the small fixtures and for tests. */
export const NO_MINIMUMS: SourceRows = Object.fromEntries(Object.keys(MIN_SOURCE_ROWS).map((k) => [k, 0])) as SourceRows;

export interface ValidateInput {
  readonly sources: MergeInputs;
  /** The merged entries, as P1-T14 writes them. */
  readonly entries: readonly Entry[];
  /** Number of syllable clips the audio pack will hold. */
  readonly audioClips: number;
}

/** Rows per source in `sources`; an omitted optional source (the words.hk dump) is left out. */
export function sourceRows(sources: MergeInputs): Partial<Record<keyof MergeInputs, number>> {
  const rows: Partial<Record<keyof MergeInputs, number>> = {};
  for (const [name, list] of Object.entries(sources) as [keyof MergeInputs, readonly unknown[] | undefined][]) {
    if (list !== undefined) rows[name] = list.length;
  }
  return rows;
}

/**
 * The problem with one space-separated reading, or undefined when it is fine. Syllables at `loan`
 * indexes are loan sounds (es1 in DSE) and only need the toned-syllable shape; every other syllable
 * must pass isValidSyllable, which accepts sentence particles (la1, ge3, …).
 */
function readingProblem(jyutping: string, loan: readonly number[] = []): string | undefined {
  const syllables = jyutping.split(" ");
  for (const [i, syllable] of syllables.entries()) {
    const isLoan = loan.includes(i);
    if (!(isLoan ? TONED_SYLLABLE.test(syllable) : isValidSyllable(syllable))) {
      return `${describeBadSyllable({ kind: isLoan ? "malformed-loan" : "invalid", cell: syllable })} in "${jyutping}"`;
    }
  }
  return undefined;
}

/**
 * Checks the build inputs and returns warnings for the build report. Throws if a source (or the
 * audio clip set) has fewer rows than `minimums` allows, or if any reading or example reading of an
 * entry is not valid Jyutping (loan syllables excepted).
 */
export function validate(input: ValidateInput, minimums: SourceRows = MIN_SOURCE_ROWS): string[] {
  const warnings: string[] = [];
  const counts: Partial<SourceRows> = { ...sourceRows(input.sources), audioClips: input.audioClips };
  if (counts.wordshkDump === undefined) {
    warnings.push("words.hk dump omitted (CANTO_SRC_WORDSHK_DUMP unset): reduced build with no words.hk definitions or example sentences");
  }
  const short = (Object.keys(minimums) as CountedSource[])
    .filter((name) => counts[name] !== undefined && counts[name] < minimums[name])
    .map((name) => `  ${name}: ${counts[name]} rows (minimum ${minimums[name].toLocaleString("en-US")})`);
  if (short.length > 0) throw new Error(`validate: ${short.length} source(s) below their minimum row count:\n${short.join("\n")}`);

  const problems: Problem[] = [];
  input.entries.forEach((entry, i) => {
    const at = (message: string) => problems.push({ line: i + 1, unit: "entry", message: `${entry.trad} ${message}` });
    for (const r of entry.readings) {
      const problem = readingProblem(r.jyutping, r.loan);
      if (problem !== undefined) at(`reading: ${problem}`);
    }
    for (const x of entry.examples) {
      const problem = x.jyutping === undefined ? undefined : readingProblem(x.jyutping, x.loan);
      if (problem !== undefined) at(`example (sense ${x.sense}): ${problem}`);
    }
  });
  throwIfProblems("merged entries", problems);
  return warnings;
}
