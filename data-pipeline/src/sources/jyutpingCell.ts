import { TONED_SYLLABLE } from "../../../src/jyutping/pattern";
import { isValidSyllable } from "../../../src/jyutping/syllables";

/** Outcome of reading a Jyutping cell; callers must handle emptiness explicitly. */
export type JyutpingCell =
  | { kind: "empty" }
  | { kind: "invalid"; syllables: string[]; invalid: string }
  | { kind: "ok"; syllables: string[] };

/** Splits a Jyutping cell on whitespace and finds the first syllable failing isValidSyllable. */
export function parseJyutpingCell(cell: string): JyutpingCell {
  const trimmed = cell.trim();
  if (trimmed === "") return { kind: "empty" };
  const syllables = trimmed.split(/\s+/);
  const invalid = syllables.find((s) => !isValidSyllable(s));
  return invalid === undefined ? { kind: "ok", syllables } : { kind: "invalid", syllables, invalid };
}

/**
 * Describes a word whose syllable count differs from its code-point count (a supplementary-plane
 * character counts as one), or returns undefined when they agree.
 */
export function syllableCountMismatch(word: string, syllables: readonly string[]): string | undefined {
  const charCount = [...word].length;
  return syllables.length === charCount ? undefined : `${word} has ${charCount} characters but ${syllables.length} syllables`;
}

/** words.hk writes a loan pronunciation with a leading "!", e.g. "!es1" in DSE. */
export const LOAN_PREFIX = "!";

/** Outcome of reading words.hk syllables that may carry the "!" loan marker. */
export type LoanAwareSyllables =
  | { kind: "ok"; syllables: string[]; loanSyllables: number[] }
  | { kind: "malformed-loan" | "invalid"; cell: string };

/**
 * Reads words.hk syllables (already split). A "!"-prefixed loan syllable is stored without the
 * "!" and its index is recorded in `loanSyllables`; it is only pattern-checked (TONED_SYLLABLE),
 * never passed to isValidSyllable, since loan sounds such as "es1" are not Jyutping. Every other
 * syllable must pass isValidSyllable. Stops at the first bad cell.
 */
export function parseLoanAwareSyllables(cells: readonly string[]): LoanAwareSyllables {
  const syllables: string[] = [];
  const loanSyllables: number[] = [];
  for (const [i, cell] of cells.entries()) {
    if (cell.startsWith(LOAN_PREFIX)) {
      const syllable = cell.slice(LOAN_PREFIX.length);
      if (!TONED_SYLLABLE.test(syllable)) return { kind: "malformed-loan", cell };
      loanSyllables.push(i);
      syllables.push(syllable);
    } else if (isValidSyllable(cell)) {
      syllables.push(cell);
    } else {
      return { kind: "invalid", cell };
    }
  }
  return { kind: "ok", syllables, loanSyllables };
}
