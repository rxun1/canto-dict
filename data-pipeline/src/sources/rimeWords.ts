import { parseJyutpingCell } from "./jyutpingCell";
import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { rimeDictBody } from "./text";
import type { WordReading } from "./types";
import { RIME_WORDS_CACHE_NAME, RIME_WORDS_URL } from "./urls";

const SOURCE_NAME = "rime words";

/**
 * Parses rime-cantonese jyut6ping3.words.dict.yaml: a YAML front matter ending with a `...`
 * line, then `word<TAB>space-separated Jyutping` rows. Blank lines and `#` comments are ignored.
 *
 * Severity policy (this file is large and messy, unlike char.csv):
 * - STRUCTURAL problems (row without a code, empty word, unexpected extra column) mean we
 *   misunderstand the file format, so they are collected and thrown once.
 * - ROW-LEVEL data problems (syllable count != character count, a syllable failing
 *   isValidSyllable) are expected in real data (e.g. proverbs containing "，"), so the row is
 *   skipped and recorded in `skipped` with its 1-based line number.
 */
export function parseRimeWords(text: string): Parsed<WordReading> {
  const rows: WordReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  for (const { lineNumber, line } of rimeDictBody(text)) {
    const [word = "", code = "", ...extra] = line.split("\t");

    if (word.trim() === "") {
      structural.push({ line: lineNumber, message: `empty word: "${line}"` });
      continue;
    }
    if (code.trim() === "") {
      structural.push({ line: lineNumber, message: `no tab-separated Jyutping code: "${line}"` });
      continue;
    }
    if (extra.length > 0) {
      structural.push({ line: lineNumber, message: `unexpected extra column(s) for ${word}: "${extra.join("\t")}"` });
      continue;
    }

    const cell = parseJyutpingCell(code);
    if (cell.kind === "empty") continue; // unreachable: an empty code was reported as structural above
    const { syllables } = cell;
    const charCount = [...word].length;
    if (syllables.length !== charCount) {
      skipped.push({
        line: lineNumber,
        message: `${word} has ${charCount} characters but ${syllables.length} syllables: "${code}"`,
      });
      continue;
    }
    if (cell.kind === "invalid") {
      skipped.push({ line: lineNumber, message: `invalid syllable "${cell.invalid}" for ${word}: "${code}"` });
      continue;
    }
    rows.push({ word, syllables });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

export function loadRimeWords(): Promise<WordReading[]> {
  return loadTolerant(SOURCE_NAME, RIME_WORDS_URL, RIME_WORDS_CACHE_NAME, parseRimeWords);
}
