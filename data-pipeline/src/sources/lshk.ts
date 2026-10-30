import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import { formatProblems, throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { CharReading } from "./types";
import { LSHK_CACHE_NAME, LSHK_URL } from "./urls";

const SOURCE_NAME = "LSHK list.tsv";
const HEADER_PREFIX = "CH\tUCODE\tJP\t";
const COLUMN_COUNT = 8; // CH UCODE JP INIT FINL TONE DESC DESC_JP
const CODE_POINT_CELL = /^U\+([0-9A-F]{4,6})$/;

/**
 * Parses the LSHK Jyutping table: tab-separated, CRLF, header `CH UCODE JP INIT FINL TONE DESC DESC_JP`.
 * A character with several readings has one row per reading. The file has no column marking merged
 * ("lazy") readings such as ng5/m5 or nei5/lei5, so every reading is returned untagged (rank undefined).
 * A JP cell may hold a multi-syllable reading (`saa1 aa6`); it is kept as one reading, single-spaced.
 * Rows with an empty JP cell (radical-like characters, described only in DESC) are ignored silently.
 *
 * Severity policy (fallback source, like rimeWords):
 * - STRUCTURAL problems (bad header, not 8 columns, malformed U+XXXX, UCODE not matching CH, CH not
 *   exactly one code point) are collected and thrown once.
 * - ROW-LEVEL data problems (a syllable failing isValidSyllable) are skipped into `skipped` with the
 *   1-based line number.
 */
export function parseLshk(text: string): Parsed<CharReading> {
  const readings: CharReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];
  const lines = splitLines(text);

  if (!lines[0]?.startsWith(HEADER_PREFIX)) {
    throw new Error(`${SOURCE_NAME}: line 1: unrecognized header (expected "CH<TAB>UCODE<TAB>JP<TAB>..."): "${lines[0] ?? ""}"`);
  }

  lines.forEach((line, index) => {
    if (index === 0 || line.trim() === "") return;
    const lineNumber = index + 1;
    const columns = line.split("\t");
    if (columns.length !== COLUMN_COUNT) {
      structural.push({ line: lineNumber, message: `expected ${COLUMN_COUNT} tab-separated columns, got ${columns.length}: "${line}"` });
      return;
    }
    const [char, codeCell, jyutpingCell] = columns;
    if ([...char].length !== 1) {
      structural.push({ line: lineNumber, message: `CH must be exactly one character: "${char}"` });
      return;
    }
    const match = CODE_POINT_CELL.exec(codeCell);
    if (!match) {
      structural.push({ line: lineNumber, message: `malformed UCODE (expected U+XXXX): "${codeCell}"` });
      return;
    }
    if (String.fromCodePoint(parseInt(match[1], 16)) !== char) {
      structural.push({ line: lineNumber, message: `UCODE ${codeCell} does not match character ${char}` });
      return;
    }

    const cell = jyutpingCell.trim();
    if (cell === "") return;
    const syllables = cell.split(/\s+/);
    const bad = syllables.find((s) => !isValidSyllable(s));
    if (bad !== undefined) {
      skipped.push({ line: lineNumber, message: `invalid syllable "${bad}" for ${char}: "${jyutpingCell}"` });
      return;
    }
    readings.push({ char, jyutping: syllables.join(" "), rank: undefined });
  });

  throwIfProblems(SOURCE_NAME, structural);
  return { readings, skipped };
}

export async function loadLshk(): Promise<CharReading[]> {
  const path = await fetchToCache(LSHK_URL, LSHK_CACHE_NAME);
  const { readings, skipped } = parseLshk(await readFile(path, "utf8"));
  if (skipped.length > 0) console.warn(formatProblems(SOURCE_NAME, skipped));
  return readings;
}
