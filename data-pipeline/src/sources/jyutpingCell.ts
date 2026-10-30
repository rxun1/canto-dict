import { isValidSyllable } from "../../../src/jyutping/syllables";

/**
 * Splits a Jyutping cell on whitespace and finds the first syllable failing isValidSyllable.
 * An empty cell yields `[""]` with `invalid: ""`; callers that allow empty cells check first.
 */
export function parseJyutpingCell(cell: string): { syllables: string[]; invalid?: string } {
  const syllables = cell.trim().split(/\s+/);
  return { syllables, invalid: syllables.find((s) => !isValidSyllable(s)) };
}
