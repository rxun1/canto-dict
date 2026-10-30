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
