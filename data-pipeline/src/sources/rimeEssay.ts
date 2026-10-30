import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { WordFrequency } from "./types";
import { RIME_ESSAY_CACHE_NAME, RIME_ESSAY_URL } from "./urls";

const SOURCE_NAME = "rime essay";

/** A weight cell: an optionally minus-signed decimal integer (minus-signed ones are rejected per row). */
const INTEGER = /^-?\d+$/;

const MINUS = "-";

const HAN = /\p{Script=Han}/u;

/**
 * Letters (incl. Han) and numbers (incl. 〇) only. No combining marks either: no real row has one,
 * and allowing them would let ideographic variation selectors (U+E0100…) through.
 */
const WORD_CHARS = /^[\p{L}\p{N}]+$/u;

/**
 * Parses rime-cantonese's essay-cantonese.txt: no header, one `word<TAB>weight` row per line,
 * where weight is a non-negative integer. Blank lines are ignored.
 *
 * Decisions:
 * - A repeated word keeps its LAST row, as Rime does (its vocabulary loader writes each row into a
 *   map), and as upstream intends: commit e2b0b2864d "Fix frequency of 革" appended `革 800` after
 *   the original `革 177`. The kept row takes the position of the last row; each earlier row is
 *   recorded in `skipped`.
 * - A weight of 0 is kept (only rare single characters have it); merge decides what it means.
 *
 * Severity policy:
 * - STRUCTURAL problems (row without a weight, extra column, empty word, weight that is not an
 *   integer or not a safe integer, no data rows at all) mean we misunderstand the file, so they are
 *   collected and thrown once.
 * - ROW-LEVEL problems (minus-signed weight, "-0" included; word with punctuation, a symbol, a
 *   space or another non-word character such as "、", "○" or a variation selector; word without a
 *   Han character such as "1"; a superseded duplicate) are skipped and recorded in `skipped` with
 *   their 1-based line numbers.
 */
export function parseRimeEssay(text: string): Parsed<WordFrequency> {
  const kept = new Map<string, { weight: number; line: number }>();
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  splitLines(text).forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;
    const [word = "", weightCell, ...extra] = line.split("\t");

    if (weightCell === undefined) {
      structural.push({ line: lineNumber, message: `no tab-separated weight: "${line}"` });
      return;
    }
    if (extra.length > 0) {
      structural.push({ line: lineNumber, message: `unexpected extra column(s) for ${word}: "${extra.join("\t")}"` });
      return;
    }
    if (word === "") {
      structural.push({ line: lineNumber, message: `empty word: "${line}"` });
      return;
    }
    if (!INTEGER.test(weightCell)) {
      structural.push({ line: lineNumber, message: `weight is not an integer for ${word}: "${weightCell}"` });
      return;
    }

    const weight = Number(weightCell);
    if (!Number.isSafeInteger(weight)) {
      structural.push({ line: lineNumber, message: `weight is not a safe integer for ${word}: "${weightCell}"` });
      return;
    }
    if (weightCell.startsWith(MINUS)) {
      skipped.push({ line: lineNumber, message: `negative weight ${weightCell} for ${word}` });
      return;
    }
    if (!WORD_CHARS.test(word)) {
      skipped.push({ line: lineNumber, message: `punctuation, symbol, space or other non-word character in word "${word}"` });
      return;
    }
    if (!HAN.test(word)) {
      skipped.push({ line: lineNumber, message: `no Han character in word "${word}"` });
      return;
    }

    const earlier = kept.get(word);
    if (earlier !== undefined) {
      skipped.push({
        line: earlier.line,
        message: `${word} ${earlier.weight} superseded by line ${lineNumber} (${weight})`,
      });
      kept.delete(word); // re-inserted below, so the kept row takes the last row's position
    }
    kept.set(word, { weight, line: lineNumber });
  });

  if (kept.size === 0 && structural.length === 0) structural.push({ line: 1, message: "no data rows" });
  throwIfProblems(SOURCE_NAME, structural);
  return {
    rows: [...kept].map(([word, { weight }]) => ({ word, weight })),
    skipped: skipped.sort((a, b) => a.line - b.line),
  };
}

export function loadRimeEssay(): Promise<WordFrequency[]> {
  return loadTolerant(SOURCE_NAME, RIME_ESSAY_URL, RIME_ESSAY_CACHE_NAME, parseRimeEssay);
}
