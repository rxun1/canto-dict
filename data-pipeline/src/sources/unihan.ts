import { isValidSyllable } from "../../../src/jyutping/syllables";
import { CODE_POINT_ERROR_MESSAGE, parseCodePointNotation } from "./codePoints";
import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { CharReading } from "./types";
import { UNIHAN_CACHE_NAME, UNIHAN_URL } from "./urls";

const SOURCE_NAME = "Unihan kCantonese";
const PROPERTY = "kCantonese";
const COLUMN_COUNT = 3;

/**
 * Parses Unihan kCantonese data. The pinned source (unicode-org/unihan-database kCantonese.txt) has
 * lines `U+XXXX <char><TAB>kCantonese<TAB>jyutping`; the character after the code point is
 * cross-checked against it. The official release layout `U+XXXX<TAB>kCantonese<TAB>jyutping`
 * (with `#` comments and other properties, as in Unihan_Readings.txt) is accepted too, so a
 * CANTO_SRC_* override with the release file works.
 * A value may hold several space-separated readings: they are alternatives, so each becomes its
 * own CharReading, in order. Rank is left undefined. An empty value is ignored silently.
 *
 * Severity policy (fallback source, like rimeWords):
 * - STRUCTURAL problems (not three columns, malformed or non-scalar code point, character not
 *   matching its code point) are collected and thrown once.
 * - ROW-LEVEL data problems (a reading failing isValidSyllable) are skipped into `skipped` with
 *   the 1-based line number; the row's other readings are kept.
 */
export function parseUnihan(text: string): Parsed<CharReading> {
  const rows: CharReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  splitLines(text).forEach((line, index) => {
    if (line.trim() === "" || line.startsWith("#")) return;
    const lineNumber = index + 1;
    const columns = line.split("\t");
    if (columns.length !== COLUMN_COUNT) {
      structural.push({ line: lineNumber, message: `expected ${COLUMN_COUNT} tab-separated columns, got ${columns.length}: "${line}"` });
      return;
    }
    const [codeColumn, property, value] = columns;
    const [codeCell, ...rest] = codeColumn.split(" ");
    const code = parseCodePointNotation(codeCell);
    if ("error" in code) {
      structural.push({ line: lineNumber, message: `${CODE_POINT_ERROR_MESSAGE[code.error]}: "${codeCell}"` });
      return;
    }
    const { char } = code;
    if (rest.length > 0 && (rest.length > 1 || rest[0] !== char)) {
      structural.push({ line: lineNumber, message: `${codeCell} is ${char} but the row says "${rest.join(" ")}"` });
      return;
    }
    if (property !== PROPERTY || value.trim() === "") return;

    for (const jyutping of value.trim().split(/\s+/)) {
      if (isValidSyllable(jyutping)) rows.push({ char, jyutping, rank: undefined });
      else skipped.push({ line: lineNumber, message: `invalid syllable "${jyutping}" for ${char}: "${value}"` });
    }
  });

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

export function loadUnihan(): Promise<CharReading[]> {
  return loadTolerant(SOURCE_NAME, UNIHAN_URL, UNIHAN_CACHE_NAME, parseUnihan);
}
