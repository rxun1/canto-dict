import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { yaleToJyutping } from "../yaleToJyutping";
import { describeBadSyllable, syllableCountMismatch } from "./jyutpingCell";
import { loadTolerant } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { KfcdRow } from "./types";
import {
  KAIFANGCIDIAN_CACHE_NAME,
  KAIFANGCIDIAN_SHA256,
  KAIFANGCIDIAN_URL,
  KAIFANGCIDIAN_ZIP_ENTRY,
} from "./urls";
import { isValidSyllable } from "../../../src/jyutping/syllables";

const SOURCE_NAME = "Kaifangcidian";

/** The column header line (word, Yale, Mandarin) that precedes the data. Its script tells simplified from traditional. */
const COLUMN_HEADER = "［粤语词汇］\t［耶鲁拼音］\t［国语解释］";

const COLUMN_COUNT = 3;

/**
 * Separators between Mandarin equivalents. The file uses "，" throughout; "、" (3 rows) and "；" (1 row)
 * also occur in the 2021-07-14 file and likewise separate equivalents.
 */
const MANDARIN_SEPARATORS = /[，、；]/;

/** Splits a Mandarin cell into trimmed, non-empty, de-duplicated equivalents in first-seen order. */
function splitMandarin(cell: string): string[] {
  const parts = cell.split(MANDARIN_SEPARATORS).map((p) => p.trim()).filter((p) => p !== "");
  return [...new Set(parts)];
}

/**
 * Parses Kaifangcidian's cidian_zhyue ylshu file: a free-text preamble (title, copyright, CC BY 3.0
 * notice), the column header line, then `word<TAB>Yale syllables<TAB>Mandarin equivalents` rows.
 * Yale uses numeric tones 1-9 and is converted to Jyutping by yaleToJyutping. The Mandarin column
 * may be empty; a trailing whitespace-only line is ignored.
 *
 * Severity policy:
 * - STRUCTURAL problems (column header not found, e.g. a different variant of the file; a row
 *   without exactly three columns; empty word or romanization) mean we misunderstand the format,
 *   so they are collected and thrown once.
 * - ROW-LEVEL problems (a syllable yaleToJyutping cannot convert, a converted syllable failing
 *   isValidSyllable such as English words written with Latin letters, syllable count != character
 *   count) are expected in real data, so the row is skipped and recorded in `skipped` with its
 *   1-based line number.
 */
export function parseKaifangcidian(text: string): Parsed<KfcdRow> {
  const rows: KfcdRow[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  const lines = splitLines(text);
  const headerIndex = lines.indexOf(COLUMN_HEADER);
  if (headerIndex === -1) {
    structural.push({ line: 1, message: `column header "${COLUMN_HEADER}" not found` });
    throwIfProblems(SOURCE_NAME, structural);
  }

  for (const [index, line] of lines.entries()) {
    if (index <= headerIndex || line.trim() === "") continue;
    const lineNumber = index + 1;
    const columns = line.split("\t");
    if (columns.length !== COLUMN_COUNT) {
      structural.push({ line: lineNumber, message: `expected ${COLUMN_COUNT} tab-separated columns, got ${columns.length}: "${line}"` });
      continue;
    }
    const [word = "", yale = "", mandarinCell = ""] = columns;
    const yaleSyllables = yale.trim() === "" ? [] : yale.trim().split(/\s+/);
    if (word.trim() === "" || yaleSyllables.length === 0) {
      structural.push({ line: lineNumber, message: `empty word or romanization: "${line}"` });
      continue;
    }

    const syllables: string[] = [];
    let problem: string | undefined;
    for (const yaleSyllable of yaleSyllables) {
      const syllable = yaleToJyutping(yaleSyllable);
      if (syllable === undefined) {
        problem = `cannot convert Yale syllable "${yaleSyllable}" for ${word}: "${yale}"`;
        break;
      }
      if (!isValidSyllable(syllable)) {
        problem = `${describeBadSyllable({ kind: "invalid", cell: syllable })} (Yale "${yaleSyllable}") for ${word}: "${yale}"`;
        break;
      }
      syllables.push(syllable);
    }
    problem ??= syllableCountMismatch(word, syllables);
    if (problem !== undefined) {
      skipped.push({ line: lineNumber, message: problem });
      continue;
    }
    rows.push({ word, syllables, mandarin: splitMandarin(mandarinCell) });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

/** Text of the pinned entry inside the downloaded zip; throws if the entry is missing. */
export function readKaifangcidianZip(zip: Uint8Array): string {
  const files = unzipSync(zip, { filter: (file) => file.name === KAIFANGCIDIAN_ZIP_ENTRY });
  const entry = files[KAIFANGCIDIAN_ZIP_ENTRY];
  if (entry === undefined) throw new Error(`${SOURCE_NAME}: zip has no entry ${KAIFANGCIDIAN_ZIP_ENTRY}`);
  return new TextDecoder("utf-8", { fatal: true }).decode(entry);
}

export function loadKaifangcidian(): Promise<KfcdRow[]> {
  return loadTolerant(SOURCE_NAME, KAIFANGCIDIAN_URL, KAIFANGCIDIAN_CACHE_NAME, parseKaifangcidian, {
    sha256: KAIFANGCIDIAN_SHA256,
    readText: async (path) => readKaifangcidianZip(await readFile(path)),
  });
}
