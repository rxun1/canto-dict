import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { overrideEnvVar, overridePath } from "../download";
import { describeBadSyllable, parseLoanAwareSyllables } from "./jyutpingCell";
import { formatProblems, throwIfProblems, type Parsed, type Problem } from "./problems";
import type { WordshkEntry, WordshkHeadword } from "./types";
import { EntryError, parseEntryContent } from "./wordshkEntryMarkup";

const SOURCE_NAME = "words.hk full dump";

/** Source name for overrideEnvVar: the dump is supplied by hand via CANTO_SRC_WORDSHK_DUMP. */
const SOURCE_KEY = "wordshk-dump";

/** The words.hk form for requesting the dump. It is an HTML page, never a download URL. */
export const WORDSHK_DUMP_REQUEST_URL = "https://words.hk/faiman/request_data/";

/** The first record is a notice whose third field starts with this. */
const NOTICE_PREFIX = "--- Generated";

/** Columns: id, headwords, entry, variants, warning, public. There is no header row. */
const COLUMN_COUNT = 6;
const PUBLIC = "已公開";
const NOT_PUBLIC = "未公開";

/** One CSV record and the 1-based line it starts on. */
interface CsvRecord {
  readonly fields: string[];
  readonly line: number;
}

/** `word:reading[:reading…]` pairs separated by commas; a bad reading is dropped and reported. */
function parseHeadwords(cell: string, report: (message: string) => void): WordshkHeadword[] {
  const headwords: WordshkHeadword[] = [];
  for (const pair of cell.split(",")) {
    const [rawWord, ...readings] = pair.split(":");
    const word = rawWord.trim();
    if (word === "") throw new EntryError(`empty headword in "${cell}"`);
    if (readings.length === 0) throw new EntryError(`headword "${word}" has no reading`);
    for (const reading of readings) {
      if (reading.trim() === "") throw new EntryError(`empty reading for headword "${word}"`);
      const parsed = parseLoanAwareSyllables(reading.trim().split(/\s+/));
      if (parsed.kind !== "ok") {
        report(`${describeBadSyllable(parsed)} in headword ${word} ("${reading}"); reading dropped`);
        continue;
      }
      const { syllables, loanSyllables } = parsed;
      headwords.push({ word, syllables, ...(loanSyllables.length > 0 && { loanSyllables }) });
    }
  }
  if (headwords.length === 0) throw new EntryError("no valid headword reading");
  return headwords;
}

/**
 * Parses the words.hk full dump CSV (all-*.csv after gunzip). It has no header row: the first
 * record is a notice (`,,"--- Generated …"`), the second an empty quoted field, then one record per
 * entry with columns id, headwords, entry, variants, warning, public. Fields are CSV-quoted and
 * the entry field spans many lines, so this uses csv-parse rather than splitting lines. The entry
 * field's mini-language is parsed by parseEntryContent (wordshkEntryMarkup.ts).
 *
 * Kept: public rows (已公開) only; non-public rows (未公開) are skipped silently. From each entry:
 * headwords (`word:reading[:reading…]`, comma-separated, "!" loan syllables as in the word list),
 * variants (comma-separated forms), pos/label tags, and per sense the yue: explanation and its
 * examples (yue: sentence, trailing Jyutping, block zho: line). English (eng:) and other languages
 * (jpn:, lzh:, …) are ignored; sim/ant/ref/img tags are dropped; #link markers are stripped.
 *
 * Severity policy (lines are each CSV record's 1-based STARTING line):
 * - STRUCTURAL problems (CSV syntax error, missing notice record, record without 6 columns,
 *   non-numeric or duplicate id, unknown public value) mean we misunderstand the format: thrown.
 * - ROW-LEVEL problems are recorded in `skipped`. The smallest broken unit is dropped: a headword
 *   reading with a bad syllable, an example's Jyutping with a bad syllable (the example is kept
 *   without it), or the whole entry for broken markup (no tag line, unknown tag, stray line, sense
 *   without yue:, …).
 */
export function parseWordshkDump(csvText: string): Parsed<WordshkEntry> {
  const records: CsvRecord[] = [];
  // csv-parse reports the line a record ENDS on; the next record starts on the line after it.
  let previousEnd = 0;
  try {
    parse(csvText, {
      bom: true,
      relax_column_count: true,
      on_record: (fields: string[], { lines }) => {
        records.push({ fields, line: previousEnd + 1 });
        previousEnd = lines;
        return null;
      },
    });
  } catch (err) {
    const line = (err as { lines?: unknown }).lines;
    throwIfProblems(SOURCE_NAME, [{ line: typeof line === "number" ? line : 0, message: (err as Error).message }]);
    throw err;
  }

  const notice = records[0]?.fields[2];
  if (notice === undefined || !notice.startsWith(NOTICE_PREFIX)) {
    throwIfProblems(SOURCE_NAME, [{ line: 1, message: `expected a first record whose third field starts with "${NOTICE_PREFIX}"` }]);
  }

  const rows: WordshkEntry[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];
  const seenIds = new Set<number>();

  for (const { fields, line } of records.slice(1)) {
    if (fields.length === 1 && fields[0] === "") continue;
    if (fields.length !== COLUMN_COUNT) {
      structural.push({ line, message: `expected ${COLUMN_COUNT} columns, got ${fields.length}` });
      continue;
    }
    const [idCell, headwordCell, content, variantCell, , publicCell] = fields;
    if (!/^\d+$/.test(idCell)) {
      structural.push({ line, message: `non-numeric id "${idCell}"` });
      continue;
    }
    const id = Number(idCell);
    if (seenIds.has(id)) {
      structural.push({ line, message: `duplicate id ${id}` });
      continue;
    }
    seenIds.add(id);
    if (publicCell === NOT_PUBLIC) continue;
    if (publicCell !== PUBLIC) {
      structural.push({ line, message: `unknown public value "${publicCell}" (expected ${PUBLIC} or ${NOT_PUBLIC})` });
      continue;
    }

    const report = (message: string): void => {
      skipped.push({ line, message: `entry ${id}: ${message}` });
    };
    try {
      const headwords = parseHeadwords(headwordCell, report);
      const variants = variantCell.split(",").map((v) => v.trim()).filter((v) => v !== "");
      rows.push({ id, headwords, variants, ...parseEntryContent(content, report) });
    } catch (err) {
      if (!(err instanceof EntryError)) throw err;
      report(`${err.message}; entry skipped`);
    }
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

/**
 * Loads the words.hk full dump from the file named by CANTO_SRC_WORDSHK_DUMP (gzip, as words.hk
 * sends it). There is no download: the dump is requested by hand. Warns about skipped rows.
 */
export async function loadWordshkDump(): Promise<WordshkEntry[]> {
  const path = await overridePath(SOURCE_KEY);
  if (path === undefined) {
    throw new Error(
      `${SOURCE_NAME}: set ${overrideEnvVar(SOURCE_KEY)} to the path of the all-*.csv.gz file ` +
        `requested at ${WORDSHK_DUMP_REQUEST_URL} (it cannot be downloaded automatically)`,
    );
  }
  const { rows, skipped } = parseWordshkDump(gunzipSync(await readFile(path)).toString("utf8"));
  if (skipped.length > 0) console.warn(formatProblems(SOURCE_NAME, skipped));
  return rows;
}
