import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import { formatProblems, throwIfProblems, type Problem } from "./problems";
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
export function parseRimeWords(text: string): { readings: WordReading[]; skipped: Problem[] } {
  const readings: WordReading[] = [];
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

    const syllables = code.trim().split(/\s+/);
    const charCount = [...word].length;
    if (syllables.length !== charCount) {
      skipped.push({
        line: lineNumber,
        message: `${word} has ${charCount} characters but ${syllables.length} syllables: "${code}"`,
      });
      continue;
    }
    const bad = syllables.find((s) => !isValidSyllable(s));
    if (bad !== undefined) {
      skipped.push({ line: lineNumber, message: `invalid syllable "${bad}" for ${word}: "${code}"` });
      continue;
    }
    readings.push({ word, syllables });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { readings, skipped };
}

export async function loadRimeWords(): Promise<WordReading[]> {
  const path = await fetchToCache(RIME_WORDS_URL, RIME_WORDS_CACHE_NAME);
  const { readings, skipped } = parseRimeWords(await readFile(path, "utf8"));
  if (skipped.length > 0) console.warn(formatProblems(SOURCE_NAME, skipped));
  return readings;
}
