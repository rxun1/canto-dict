import { readFile } from "node:fs/promises";
import { fetchToCache } from "../download";
import { isSingleCodePoint } from "./codePoints";
import { parseJyutpingCell } from "./jyutpingCell";
import { throwIfProblems, type Problem } from "./problems";
import { RIME_CHARS_CACHE_NAME, RIME_CHARS_URL } from "./urls";
import { splitLines } from "./text";
import type { CharReading, ReadingRank } from "./types";

/** Single source of truth for the pron_rank column (3rd column of char.csv). */
const RANK_BY_RIME_LABEL: ReadonlyMap<string, ReadingRank> = new Map<string, ReadingRank>([
  ["預設", "default"],
  ["常用", "common"],
  ["罕見", "rare"],
  ["棄用", "obsolete"],
]);

const HEADER_PREFIX = "char,jyutping,";

/**
 * Parses rime-cantonese char.csv: `char,jyutping,pron_rank,tone_var,literary_vernacular,comment`.
 * Only the first three columns are used; none of them can contain commas or quotes.
 * An empty rank cell yields `rank: undefined` (the real file has none, but we don't invent one).
 * A jyutping cell may hold several space-separated syllables (e.g. `sap6 sing1`); it is kept
 * as one reading with single spaces.
 * All problems (bad char, bad syllable, unknown rank) are collected and thrown as one Error.
 */
export function parseRimeChars(text: string): CharReading[] {
  const readings: CharReading[] = [];
  const problems: Problem[] = [];

  splitLines(text).forEach((line, index) => {
    if (line.trim() === "" || line.startsWith(HEADER_PREFIX)) return;
    const lineNumber = index + 1;
    const [charCell = "", jyutpingCell = "", rankCell = ""] = line.split(",");
    const char = charCell.trim();
    const cell = parseJyutpingCell(jyutpingCell);
    const label = rankCell.trim();
    const rank = label === "" ? undefined : RANK_BY_RIME_LABEL.get(label);
    const before = problems.length;

    if (!isSingleCodePoint(char)) {
      problems.push({ line: lineNumber, message: `char must be exactly one character: "${charCell}"` });
    }
    if (cell.kind !== "ok") {
      problems.push({ line: lineNumber, message: `invalid Jyutping for ${char}: "${jyutpingCell}"` });
    }
    if (label !== "" && rank === undefined) {
      problems.push({ line: lineNumber, message: `unknown rank "${label}" for ${char}` });
    }
    if (problems.length === before && cell.kind === "ok") {
      readings.push({ char, jyutping: cell.syllables.join(" "), rank });
    }
  });

  throwIfProblems("char.csv", problems);
  return readings;
}

export async function loadRimeChars(): Promise<CharReading[]> {
  const path = await fetchToCache(RIME_CHARS_URL, RIME_CHARS_CACHE_NAME);
  return parseRimeChars(await readFile(path, "utf8"));
}
