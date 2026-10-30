import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
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
const MAX_REPORTED_PROBLEMS = 20;

interface Problem {
  line: number;
  message: string;
}

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
    const syllables = jyutpingCell.trim().split(/\s+/);
    const label = rankCell.trim();
    const rank = label === "" ? undefined : RANK_BY_RIME_LABEL.get(label);
    const before = problems.length;

    if ([...char].length !== 1) {
      problems.push({ line: lineNumber, message: `char must be exactly one character: "${charCell}"` });
    }
    const bad = syllables.find((s) => !isValidSyllable(s));
    if (bad !== undefined) {
      problems.push({ line: lineNumber, message: `invalid Jyutping for ${char}: "${jyutpingCell}"` });
    }
    if (label !== "" && rank === undefined) {
      problems.push({ line: lineNumber, message: `unknown rank "${label}" for ${char}` });
    }
    if (problems.length === before) readings.push({ char, jyutping: syllables.join(" "), rank });
  });

  if (problems.length > 0) {
    const shown = problems
      .slice(0, MAX_REPORTED_PROBLEMS)
      .map((p) => `  line ${p.line}: ${p.message}`)
      .join("\n");
    throw new Error(`char.csv has ${problems.length} problem(s):\n${shown}`);
  }
  return readings;
}

export async function loadRimeChars(): Promise<CharReading[]> {
  const path = await fetchToCache(RIME_CHARS_URL, RIME_CHARS_CACHE_NAME);
  return parseRimeChars(await readFile(path, "utf8"));
}
