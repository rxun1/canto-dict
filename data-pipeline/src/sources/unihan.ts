import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import { formatProblems, throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { CharReading } from "./types";
import { UNIHAN_CACHE_NAME, UNIHAN_URL } from "./urls";

const SOURCE_NAME = "Unihan kCantonese";
const PROPERTY = "kCantonese";
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES_START = 0xd800;
const SURROGATES_END = 0xdfff;

/** `U+XXXX`, optionally followed by the character itself (the unihan-database review-file layout). */
const CODE_POINT_CELL = /^U\+([0-9A-F]{4,6})(?: (\S+))?$/;

/**
 * Parses Unihan kCantonese data: `U+XXXX<TAB>kCantonese<TAB>jyutping`, with `#` comment lines and
 * other properties ignored. Also accepts the unihan-database layout where the first cell is
 * `U+XXXX <char>`; the character is then cross-checked against the code point.
 * A value may hold several space-separated readings: they are alternatives, so each becomes its
 * own CharReading, in order. Rank is left undefined.
 *
 * Severity policy (fallback source, like rimeWords):
 * - STRUCTURAL problems (not three columns, malformed or out-of-range code point, character not
 *   matching its code point) are collected and thrown once.
 * - ROW-LEVEL data problems (a reading failing isValidSyllable) are skipped into `skipped` with
 *   the 1-based line number; the row's other readings are kept.
 */
export function parseUnihan(text: string): Parsed<CharReading> {
  const readings: CharReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  splitLines(text).forEach((line, index) => {
    if (line.trim() === "" || line.startsWith("#")) return;
    const lineNumber = index + 1;
    const columns = line.split("\t");
    if (columns.length !== 3) {
      structural.push({ line: lineNumber, message: `expected 3 tab-separated columns, got ${columns.length}: "${line}"` });
      return;
    }
    const [codeCell, property, value] = columns;
    const match = CODE_POINT_CELL.exec(codeCell);
    const codePoint = match ? parseInt(match[1], 16) : NaN;
    if (
      !match ||
      codePoint > MAX_CODE_POINT ||
      (codePoint >= SURROGATES_START && codePoint <= SURROGATES_END)
    ) {
      structural.push({ line: lineNumber, message: `malformed code point (expected U+XXXX): "${codeCell}"` });
      return;
    }
    const char = String.fromCodePoint(codePoint);
    if (match[2] !== undefined && match[2] !== char) {
      structural.push({ line: lineNumber, message: `${match[1]} is ${char} but the row says ${match[2]}` });
      return;
    }
    if (property !== PROPERTY) return;

    for (const jyutping of value.trim().split(/\s+/)) {
      if (isValidSyllable(jyutping)) readings.push({ char, jyutping, rank: undefined });
      else skipped.push({ line: lineNumber, message: `invalid syllable "${jyutping}" for ${char}: "${value}"` });
    }
  });

  throwIfProblems(SOURCE_NAME, structural);
  return { readings, skipped };
}

export async function loadUnihan(): Promise<CharReading[]> {
  const path = await fetchToCache(UNIHAN_URL, UNIHAN_CACHE_NAME);
  const { readings, skipped } = parseUnihan(await readFile(path, "utf8"));
  if (skipped.length > 0) console.warn(formatProblems(SOURCE_NAME, skipped));
  return readings;
}
