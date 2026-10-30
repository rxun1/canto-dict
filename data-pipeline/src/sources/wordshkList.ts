import { TONED_SYLLABLE } from "../../../src/jyutping/pattern";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { WordReading } from "./types";
import { WORDSHK_LIST_CACHE_NAME, WORDSHK_LIST_SHA256, WORDSHK_LIST_URL } from "./urls";

const SOURCE_NAME = "words.hk word list";

/** The one metadata line words.hk puts at the top instead of a column header. */
const SOURCE_LINE = "Source,https://words.hk/faiman/analysis/wordslist/";

/** words.hk marks a word containing variant characters (異體字) with a trailing "*". */
const VARIANT_MARKER = "*";

/** words.hk writes a loan pronunciation with a leading "!", e.g. "!es1". */
const LOAN_PREFIX = "!";

/**
 * Parses words.hk's wordslist.csv: a `Source,<url>` line, then one row per word,
 * `word,reading[,reading...]`, where each reading is space-separated Jyutping with one syllable
 * per character. No quoting, no header row, CRLF endings. One WordReading is emitted per reading.
 *
 * Loan syllables ("!es1") are stored without the "!" and listed in `loanSyllables`; they are only
 * pattern-checked (TONED_SYLLABLE), never passed to isValidSyllable, since loan sounds such as
 * "es1" are not Jyutping. A trailing "*" variant marker on the word is stripped.
 *
 * Severity policy:
 * - STRUCTURAL problems (unrecognized first line, row without a reading, empty word, empty
 *   reading) mean we misunderstand the format, so they are collected and thrown once.
 * - ROW-LEVEL problems (malformed loan syllable, non-loan syllable failing isValidSyllable,
 *   syllable count != character count) are expected in real data, so that reading is skipped and
 *   recorded in `skipped` with its 1-based line number.
 */
export function parseWordshkList(text: string): Parsed<WordReading> {
  const rows: WordReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  const lines = splitLines(text);
  if (lines[0] !== SOURCE_LINE) {
    structural.push({ line: 1, message: `expected the first line to be "${SOURCE_LINE}", got "${lines[0]}"` });
    throwIfProblems(SOURCE_NAME, structural);
  }

  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === "") continue;
    const lineNumber = index + 1;
    const [rawWord, ...readings] = line.split(",");
    const word = rawWord.endsWith(VARIANT_MARKER) ? rawWord.slice(0, -VARIANT_MARKER.length) : rawWord;

    if (word.trim() === "") {
      structural.push({ line: lineNumber, message: `empty word: "${line}"` });
      continue;
    }
    if (readings.length === 0) {
      structural.push({ line: lineNumber, message: `no reading for ${word}: "${line}"` });
      continue;
    }
    if (readings.some((r) => r.trim() === "")) {
      structural.push({ line: lineNumber, message: `empty reading for ${word}: "${line}"` });
      continue;
    }

    const charCount = [...word].length;
    for (const reading of readings) {
      const cells = reading.trim().split(/\s+/);
      const loanSyllables: number[] = [];
      const syllables: string[] = [];
      let problem: string | undefined;

      cells.forEach((cell, i) => {
        if (problem !== undefined) return;
        if (cell.startsWith(LOAN_PREFIX)) {
          const syllable = cell.slice(LOAN_PREFIX.length);
          if (!TONED_SYLLABLE.test(syllable)) {
            problem = `malformed loan syllable "${cell}" for ${word}: "${reading}"`;
            return;
          }
          loanSyllables.push(i);
          syllables.push(syllable);
        } else if (isValidSyllable(cell)) {
          syllables.push(cell);
        } else {
          problem = `invalid syllable "${cell}" for ${word}: "${reading}"`;
        }
      });

      if (problem === undefined && syllables.length !== charCount) {
        problem = `${word} has ${charCount} characters but ${syllables.length} syllables: "${reading}"`;
      }
      if (problem !== undefined) {
        skipped.push({ line: lineNumber, message: problem });
        continue;
      }
      rows.push(loanSyllables.length > 0 ? { word, syllables, loanSyllables } : { word, syllables });
    }
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

export function loadWordshkList(): Promise<WordReading[]> {
  return loadTolerant(SOURCE_NAME, WORDSHK_LIST_URL, WORDSHK_LIST_CACHE_NAME, parseWordshkList, {
    sha256: WORDSHK_LIST_SHA256,
  });
}
