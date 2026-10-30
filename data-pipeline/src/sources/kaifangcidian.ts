import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { fetchToCache } from "../download";
import { yaleToJyutping } from "../yaleToJyutping";
import { describeBadSyllable, syllableCountMismatch } from "./jyutpingCell";
import { formatProblems, throwIfProblems, type Parsed, type Problem } from "./problems";
import { splitLines } from "./text";
import type { KfcdRow, MandarinEquivalent } from "./types";
import {
  KAIFANGCIDIAN_CACHE_NAME,
  KAIFANGCIDIAN_SHA256,
  KAIFANGCIDIAN_URL,
  KAIFANGCIDIAN_ZIP_ENTRY_SIMP,
  KAIFANGCIDIAN_ZIP_ENTRY_TRAD,
} from "./urls";

const SOURCE_NAME = "Kaifangcidian";

/** Column header line (word, Yale, Mandarin) preceding the data; its script identifies each file. */
const COLUMN_HEADER_TRAD = "［粵語詞彙］\t［耶魯拼音］\t［國語解釋］";
const COLUMN_HEADER_SIMP = "［粤语词汇］\t［耶鲁拼音］\t［国语解释］";

const COLUMN_COUNT = 3;

/**
 * Separators between Mandarin equivalents. The file uses "，" throughout; "、" (3 rows) and "；" (1 row)
 * also occur in the 2021-07-14 file and likewise separate equivalents.
 */
const MANDARIN_SEPARATORS = /[，、；]/;

/** Splits a Mandarin cell into its trimmed, non-empty equivalents in file order (not de-duplicated). */
function splitMandarin(cell: string): string[] {
  return cell.split(MANDARIN_SEPARATORS).map((p) => p.trim()).filter((p) => p !== "");
}

/** Pairs traditional and simplified items by position and drops repeated (trad, simp) pairs, keeping first-seen order. */
function pairMandarin(trad: readonly string[], simp: readonly string[]): MandarinEquivalent[] {
  const seen = new Set<string>();
  const pairs: MandarinEquivalent[] = [];
  for (const [i, t] of trad.entries()) {
    const s = simp[i] ?? "";
    const key = `${t}\t${s}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ trad: t, simp: s });
  }
  return pairs;
}

interface Columns {
  readonly word: string;
  readonly yale: string;
  readonly mandarin: string;
}

/**
 * Parses Kaifangcidian's cidian_zhyue ylshu dictionary from its two line-aligned files, traditional
 * (ft) and simplified (jt). Each file is a free-text preamble (title, copyright, CC BY 3.0 notice),
 * its own column header line, then `word<TAB>Yale syllables<TAB>Mandarin equivalents` rows. Line N of
 * one file is the same row as line N of the other. Yale (numeric tones 1-9) is converted to Jyutping
 * by yaleToJyutping. The Mandarin column may be empty; whitespace-only lines are ignored.
 *
 * Severity policy:
 * - STRUCTURAL problems (a column header not found, e.g. a different variant or swapped files; the
 *   files differing in line count or header position; a row without exactly three columns; empty
 *   word or romanization; a blank line in only one file) mean we misunderstand the format, so they
 *   are collected and thrown once.
 * - ROW-LEVEL problems (the two files' romanizations differ; their Mandarin item counts differ; a
 *   syllable yaleToJyutping cannot convert; a converted syllable failing isValidSyllable, such as
 *   English words written with Latin letters; syllable count != character count) are expected in
 *   real data, so the row is skipped and recorded in `skipped` with its 1-based line number.
 */
export function parseKaifangcidian(tradText: string, simpText: string): Parsed<KfcdRow> {
  const rows: KfcdRow[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  const tradLines = splitLines(tradText);
  const simpLines = splitLines(simpText);
  const tradHeader = tradLines.indexOf(COLUMN_HEADER_TRAD);
  const simpHeader = simpLines.indexOf(COLUMN_HEADER_SIMP);
  if (tradHeader === -1) {
    structural.push({ line: 1, message: `traditional file: column header "${COLUMN_HEADER_TRAD}" not found` });
  }
  if (simpHeader === -1) {
    structural.push({ line: 1, message: `simplified file: column header "${COLUMN_HEADER_SIMP}" not found` });
  }
  throwIfProblems(SOURCE_NAME, structural);
  if (tradHeader !== simpHeader) {
    structural.push({ line: 1, message: `column header is on line ${tradHeader + 1} (traditional) but line ${simpHeader + 1} (simplified)` });
  }
  if (tradLines.length !== simpLines.length) {
    structural.push({ line: 1, message: `line counts differ: ${tradLines.length} (traditional) vs ${simpLines.length} (simplified)` });
  }
  throwIfProblems(SOURCE_NAME, structural);

  /** Reads one file's line as columns, or records a structural problem and returns undefined. */
  const readColumns = (line: string, label: string, lineNumber: number): Columns | undefined => {
    const columns = line.split("\t");
    if (columns.length !== COLUMN_COUNT) {
      structural.push({ line: lineNumber, message: `${label} file: expected ${COLUMN_COUNT} tab-separated columns, got ${columns.length}: "${line}"` });
      return undefined;
    }
    const [word = "", yale = "", mandarin = ""] = columns;
    if (word.trim() === "" || yale.trim() === "") {
      structural.push({ line: lineNumber, message: `${label} file: empty word or romanization: "${line}"` });
      return undefined;
    }
    return { word, yale: yale.trim().split(/\s+/).join(" "), mandarin };
  };

  for (const [index, tradLine] of tradLines.entries()) {
    if (index <= tradHeader) continue;
    const simpLine = simpLines[index] ?? "";
    const lineNumber = index + 1;
    const tradBlank = tradLine.trim() === "";
    const simpBlank = simpLine.trim() === "";
    if (tradBlank && simpBlank) continue;
    if (tradBlank !== simpBlank) {
      structural.push({ line: lineNumber, message: `blank in only the ${tradBlank ? "traditional" : "simplified"} file: "${tradBlank ? simpLine : tradLine}"` });
      continue;
    }
    const trad = readColumns(tradLine, "traditional", lineNumber);
    const simp = readColumns(simpLine, "simplified", lineNumber);
    if (trad === undefined || simp === undefined) continue;

    if (trad.yale !== simp.yale) {
      skipped.push({ line: lineNumber, message: `romanization differs between the files for ${trad.word}: "${trad.yale}" vs "${simp.yale}"` });
      continue;
    }
    const tradMandarin = splitMandarin(trad.mandarin);
    const simpMandarin = splitMandarin(simp.mandarin);
    if (tradMandarin.length !== simpMandarin.length) {
      skipped.push({ line: lineNumber, message: `${tradMandarin.length} traditional but ${simpMandarin.length} simplified Mandarin equivalents for ${trad.word}` });
      continue;
    }

    const syllables: string[] = [];
    let problem: string | undefined;
    for (const yaleSyllable of trad.yale.split(" ")) {
      const syllable = yaleToJyutping(yaleSyllable);
      if (syllable === undefined) {
        problem = `cannot convert Yale syllable "${yaleSyllable}" for ${trad.word}: "${trad.yale}"`;
        break;
      }
      if (!isValidSyllable(syllable)) {
        problem = `${describeBadSyllable({ kind: "invalid", cell: syllable })} (Yale "${yaleSyllable}") for ${trad.word}: "${trad.yale}"`;
        break;
      }
      syllables.push(syllable);
    }
    problem ??= syllableCountMismatch(trad.word, syllables) ?? syllableCountMismatch(simp.word, syllables);
    if (problem !== undefined) {
      skipped.push({ line: lineNumber, message: problem });
      continue;
    }
    rows.push({ word: trad.word, wordSimp: simp.word, syllables, mandarin: pairMandarin(tradMandarin, simpMandarin) });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

/** The texts of the traditional and simplified entries inside the downloaded zip; throws if either is missing. */
export function readKaifangcidianZip(zip: Uint8Array): { trad: string; simp: string } {
  const wanted = new Set([KAIFANGCIDIAN_ZIP_ENTRY_TRAD, KAIFANGCIDIAN_ZIP_ENTRY_SIMP]);
  const files = unzipSync(zip, { filter: (file) => wanted.has(file.name) });
  const decode = (name: string): string => {
    const entry = files[name];
    if (entry === undefined) throw new Error(`${SOURCE_NAME}: zip has no entry ${name}`);
    return new TextDecoder("utf-8", { fatal: true }).decode(entry);
  };
  return { trad: decode(KAIFANGCIDIAN_ZIP_ENTRY_TRAD), simp: decode(KAIFANGCIDIAN_ZIP_ENTRY_SIMP) };
}

/** Fetches (or reuses the cached, hash-checked) zip, reads both entries and parses them together. */
export async function loadKaifangcidian(): Promise<KfcdRow[]> {
  const path = await fetchToCache(KAIFANGCIDIAN_URL, KAIFANGCIDIAN_CACHE_NAME, { sha256: KAIFANGCIDIAN_SHA256 });
  const { trad, simp } = readKaifangcidianZip(await readFile(path));
  const { rows, skipped } = parseKaifangcidian(trad, simp);
  if (skipped.length > 0) console.warn(formatProblems(SOURCE_NAME, skipped));
  return rows;
}
