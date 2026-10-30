import { readFile } from "node:fs/promises";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import type { CharReading, ReadingRank } from "./types";

export const RIME_CHARS_URL =
  "https://raw.githubusercontent.com/CanCLID/rime-cantonese-upstream/main/char.csv";

/** Single source of truth for the pron_rank column (3rd column of char.csv). */
export const RANK_BY_RIME_LABEL: Record<string, ReadingRank> = {
  預設: "default",
  常用: "common",
  罕見: "rare",
  棄用: "obsolete",
};

const HEADER_PREFIX = "char,jyutping,";

/**
 * Parses rime-cantonese char.csv: `char,jyutping,pron_rank,tone_var,literary_vernacular,comment`.
 * Only the first three columns are used; none of them can contain commas or quotes.
 * An empty rank cell yields `rank: undefined` (the real file has none, but we don't invent one).
 * A jyutping cell may hold several space-separated syllables (e.g. `sap6 sing1`); it is kept
 * as one reading with single spaces.
 */
export function parseRimeChars(text: string): CharReading[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const readings: CharReading[] = [];
  const unknownRanks = new Set<string>();

  for (const line of lines) {
    if (line.trim() === "" || line.startsWith(HEADER_PREFIX)) continue;
    const [char, jyutpingCell = "", rankCell = ""] = line.split(",");
    const syllables = jyutpingCell.trim().split(/\s+/);
    for (const syllable of syllables) {
      if (!isValidSyllable(syllable)) {
        throw new Error(`Invalid Jyutping for ${char}: "${jyutpingCell}"`);
      }
    }
    const label = rankCell.trim();
    let rank: ReadingRank | undefined;
    if (label !== "") {
      rank = RANK_BY_RIME_LABEL[label];
      if (rank === undefined) unknownRanks.add(label);
    }
    readings.push({ char, jyutping: syllables.join(" "), rank });
  }

  if (unknownRanks.size > 0) {
    throw new Error(`Unknown rime rank value(s): ${[...unknownRanks].join(", ")}`);
  }
  return readings;
}

export async function loadRimeChars(): Promise<CharReading[]> {
  const path = await fetchToCache(RIME_CHARS_URL, "rime-char.csv");
  return parseRimeChars(await readFile(path, "utf8"));
}
