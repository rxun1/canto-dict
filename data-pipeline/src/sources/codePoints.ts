// Dependency-free on purpose (shared by source parsers; keep it import-free).

const NOTATION = /^U\+([0-9A-F]{4,6})$/;
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES_START = 0xd800;
const SURROGATES_END = 0xdfff;

/**
 * The character for `U+XXXX` notation (U+ then 4-6 UPPERCASE hex digits), or undefined when the
 * cell is malformed, above U+10FFFF, or a surrogate (not a Unicode scalar value).
 * Use `isCodePointNotation` first to tell those two failures apart.
 */
export function charFromCodePointNotation(cell: string): string | undefined {
  const match = NOTATION.exec(cell);
  if (!match) return undefined;
  const codePoint = parseInt(match[1], 16);
  if (codePoint > MAX_CODE_POINT || (codePoint >= SURROGATES_START && codePoint <= SURROGATES_END)) {
    return undefined;
  }
  return String.fromCodePoint(codePoint);
}

/** True when the cell has the `U+XXXX` shape (whether or not it is a valid scalar value). */
export function isCodePointNotation(cell: string): boolean {
  return NOTATION.test(cell);
}

/** True for exactly one Unicode code point (a supplementary-plane character counts as one). */
export function isSingleCodePoint(s: string): boolean {
  return [...s].length === 1;
}
