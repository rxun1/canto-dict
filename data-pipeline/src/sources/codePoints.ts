// Dependency-free on purpose (shared by source parsers; keep it import-free).

const NOTATION = /^U\+([0-9A-F]{4,6})$/;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES_START = 0xd800;
const SURROGATES_END = 0xdfff;

export type CodePointError = "malformed" | "non-scalar";

/** The one place the wording for each failure kind lives. */
export const CODE_POINT_ERROR_MESSAGE: Readonly<Record<CodePointError, string>> = {
  malformed: "malformed code point (expected U+XXXX)",
  "non-scalar": "not a Unicode scalar value",
};

/**
 * Parses `U+XXXX` notation (U+ then 4-6 UPPERCASE hex digits). Returns the character, or an error
 * kind: "malformed" (wrong shape) or "non-scalar" (above U+10FFFF, or a surrogate).
 */
export function parseCodePointNotation(cell: string): { char: string } | { error: CodePointError } {
  const match = NOTATION.exec(cell);
  if (!match) return { error: "malformed" };
  const codePoint = parseInt(match[1], 16);
  if (codePoint > MAX_CODE_POINT || (codePoint >= SURROGATES_START && codePoint <= SURROGATES_END)) {
    return { error: "non-scalar" };
  }
  return { char: String.fromCodePoint(codePoint) };
}

/** True for exactly one Unicode code point (a supplementary-plane character counts as one). */
export function isSingleCodePoint(s: string): boolean {
  return [...s].length === 1;
}
