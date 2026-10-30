import { CODE_POINT_ERROR_MESSAGE, isSingleCodePoint, parseCodePointNotation } from "./codePoints";
import { parseJyutpingCell } from "./jyutpingCell";
import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { CharReading } from "./types";
import { LSHK_CACHE_NAME, LSHK_URL } from "./urls";

const SOURCE_NAME = "LSHK list.tsv";
/** Column names of list.tsv, in order; the header line must match them exactly. */
export const LSHK_COLUMNS = ["CH", "UCODE", "JP", "INIT", "FINL", "TONE", "DESC", "DESC_JP"] as const;
const HEADER = LSHK_COLUMNS.join("\t");

/**
 * Parses the LSHK Jyutping table: tab-separated, CRLF, header `CH UCODE JP INIT FINL TONE DESC DESC_JP`.
 * A character with several readings has one row per reading. The file has no column marking merged
 * ("lazy") readings such as ng5/m5 or nei5/lei5, so every reading is returned untagged (rank undefined).
 * A JP cell may hold a multi-syllable reading (`saa1 aa6`); it is kept as one reading, single-spaced.
 * Rows with an empty JP cell (radical-like characters, described only in DESC) are ignored silently.
 *
 * Severity policy (fallback source, like rimeWords):
 * - STRUCTURAL problems (bad header, wrong column count, malformed or non-scalar U+XXXX, UCODE not
 *   matching CH, CH not exactly one code point) are collected and thrown once.
 * - ROW-LEVEL data problems (a syllable failing isValidSyllable) are skipped into `skipped` with the
 *   1-based line number.
 */
export function parseLshk(text: string): Parsed<CharReading> {
  const rows: CharReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];
  const lines = splitLines(text);

  if (lines[0] !== HEADER) {
    throw new Error(`${SOURCE_NAME}: line 1: unrecognized header (expected "${HEADER}"): "${lines[0] ?? ""}"`);
  }

  lines.forEach((line, index) => {
    if (index === 0 || line.trim() === "") return;
    const lineNumber = index + 1;
    const columns = line.split("\t");
    if (columns.length !== LSHK_COLUMNS.length) {
      structural.push({ line: lineNumber, message: `expected ${LSHK_COLUMNS.length} tab-separated columns, got ${columns.length}: "${line}"` });
      return;
    }
    const [char, codeCell, jyutpingCell] = columns;
    if (!isSingleCodePoint(char)) {
      structural.push({ line: lineNumber, message: `CH must be exactly one character: "${char}"` });
      return;
    }
    const code = parseCodePointNotation(codeCell);
    if ("error" in code) {
      structural.push({ line: lineNumber, message: `UCODE ${CODE_POINT_ERROR_MESSAGE[code.error]}: "${codeCell}"` });
      return;
    }
    if (code.char !== char) {
      structural.push({ line: lineNumber, message: `UCODE ${codeCell} does not match character ${char}` });
      return;
    }

    const cell = parseJyutpingCell(jyutpingCell);
    if (cell.kind === "empty") return;
    if (cell.kind === "invalid") {
      skipped.push({ line: lineNumber, message: `invalid syllable "${cell.invalid}" for ${char}: "${jyutpingCell}"` });
      return;
    }
    rows.push({ char, jyutping: cell.syllables.join(" "), rank: undefined });
  });

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

export function loadLshk(): Promise<CharReading[]> {
  return loadTolerant(SOURCE_NAME, LSHK_URL, LSHK_CACHE_NAME, parseLshk);
}
