import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import { formatProblems, throwIfProblems, type Problem } from "./problems";
import { splitLines } from "./text";
import type { WordReading } from "./types";
import { RIME_WORDS_CACHE_NAME, RIME_WORDS_URL } from "./urls";

const YAML_END_MARKER = "...";
const SOURCE_NAME = "rime words";

/**
 * Parses rime-cantonese jyut6ping3.words.dict.yaml: a YAML front matter ending with a `...`
 * line, then `word<TAB>space-separated Jyutping` rows. Blank lines and `#` comments are ignored.
 *
 * Severity policy (this file is large and messy, unlike char.csv):
 * - STRUCTURAL problems (no end marker, row without a code, unexpected extra column) mean we
 *   misunderstand the file format, so they are collected and thrown once.
 * - ROW-LEVEL data problems (syllable count != character count, a syllable failing
 *   isValidSyllable) are expected in real data (e.g. proverbs containing "，"), so the row is
 *   skipped and recorded in `skipped` with its 1-based line number.
 */
export function parseRimeWords(text: string): { readings: WordReading[]; skipped: Problem[] } {
  const lines = splitLines(text);
  const endIndex = lines.findIndex((l) => l.trim() === YAML_END_MARKER);
  if (endIndex === -1) {
    throw new Error(`${SOURCE_NAME}: YAML end marker "${YAML_END_MARKER}" not found`);
  }

  const readings: WordReading[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  for (let index = endIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === "" || line.startsWith("#")) continue;
    const lineNumber = index + 1;
    const [word = "", code = "", ...extra] = line.split("\t");

    if (code.trim() === "") {
      structural.push({ line: lineNumber, message: `no tab-separated Jyutping code: "${line}"` });
      continue;
    }
    if (extra.length > 0) {
      structural.push({ line: lineNumber, message: `unexpected extra column(s) for ${word}: "${extra.join("\t")}"` });
      continue;
    }

    const jyutping = code.trim().split(/\s+/);
    const charCount = [...word].length;
    if (jyutping.length !== charCount) {
      skipped.push({
        line: lineNumber,
        message: `${word} has ${charCount} characters but ${jyutping.length} syllables: "${code}"`,
      });
      continue;
    }
    const bad = jyutping.find((s) => !isValidSyllable(s));
    if (bad !== undefined) {
      skipped.push({ line: lineNumber, message: `invalid syllable "${bad}" for ${word}: "${code}"` });
      continue;
    }
    readings.push({ word, jyutping });
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
