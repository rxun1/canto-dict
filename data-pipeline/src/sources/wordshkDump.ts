import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { overrideEnvVar, overridePath } from "../download";
import { parseLoanAwareSyllables } from "./jyutpingCell";
import { formatProblems, throwIfProblems, type Parsed, type Problem } from "./problems";
import type { WordshkEntry, WordshkExample, WordshkHeadword, WordshkSense } from "./types";

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

/** The whole entry column of an entry with no content yet. */
const NO_DATA = "未有內容 NO DATA";

const SENSE_SEPARATOR = "----";
const EXPLANATION_MARKER = "<explanation>";
const EXAMPLE_MARKER = "<eg>";

/** The entry's first line: one or more "(name:value)" tags. */
const TAG_LINE = /^(\([A-Za-z]+:[^)]*\))+$/;
const TAG = /\(([A-Za-z]+):([^)]*)\)/g;
/** Tags parsed only to be dropped: synonyms, antonyms, references, images (YAGNI). */
const IGNORED_TAGS: ReadonlySet<string> = new Set(["sim", "ant", "ref", "img"]);

/** A language clause line, e.g. "yue:…", "eng:…", "zho:…"; any other line continues the previous clause. */
const CLAUSE = /^([a-z]{3}):(.*)$/;

/**
 * "#" followed by link text (up to whitespace, punctuation or another "#"), with the optional single
 * space words.hk puts before/after a link to delimit it.
 */
const LINK = /( ?)#([^\s\p{P}#]+)( ?)/gu;
const ASCII_WORD_CHAR = /[A-Za-z0-9]/;

/** Han characters: a trailing "(…)" containing any is a gloss, not Jyutping. */
const HAN = /\p{Script=Han}/u;
const LOOKS_TONED = /[a-z]+[1-6]/;
/** Everything except letters, digits, "!" and whitespace separates Jyutping syllables. */
const JYUTPING_SEPARATORS = /[^\sA-Za-z0-9!]/g;

/** A row-level problem that makes the whole entry unusable. */
class EntryError extends Error {}

interface CsvRecord {
  readonly record: string[];
  readonly info: { readonly lines: number };
  readonly raw: string;
}

/**
 * Removes words.hk #link markup: "#中華民國 初年" → "中華民國初年", "同 #啲" → "同啲". A delimiting
 * space is kept only between two ASCII letters/digits ("use #USB now" → "use USB now").
 */
function stripLinks(text: string): string {
  return text.replace(LINK, (match, before: string, link: string, after: string, offset: number, whole: string) => {
    const previous = whole[offset - 1];
    const next = whole[offset + match.length];
    const keepBefore = before !== "" && previous !== undefined && ASCII_WORD_CHAR.test(previous);
    const keepAfter = after !== "" && next !== undefined && ASCII_WORD_CHAR.test(next);
    return `${keepBefore ? " " : ""}${link}${keepAfter ? " " : ""}`;
  });
}

/** Splits a trailing "(jyutping)" off an example line; the parenthesis must hold no Han and look toned. */
function splitJyutping(line: string): { text: string; jyutping?: string } {
  const trimmed = line.trim();
  const open = trimmed.lastIndexOf("(");
  if (!trimmed.endsWith(")") || open === -1) return { text: trimmed };
  const inner = trimmed.slice(open + 1, -1);
  if (HAN.test(inner) || !LOOKS_TONED.test(inner)) return { text: trimmed };
  return { text: trimmed.slice(0, open).trim(), jyutping: inner };
}

/** Jyutping cells of an example parenthesis: punctuation dropped, a trailing "!" is punctuation, a leading "!" a loan marker. */
function jyutpingCells(jyutping: string): string[] {
  return jyutping
    .replace(JYUTPING_SEPARATORS, " ")
    .split(/\s+/)
    .map((cell) => cell.replace(/!+$/, ""))
    .filter((cell) => cell !== "");
}

function describeBadSyllable(kind: "malformed-loan" | "invalid", cell: string): string {
  return `${kind === "malformed-loan" ? "malformed loan syllable" : "invalid syllable"} "${cell}"`;
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
        report(`${describeBadSyllable(parsed.kind, parsed.cell)} in headword ${word} ("${reading}"); reading dropped`);
        continue;
      }
      const { syllables, loanSyllables } = parsed;
      headwords.push({ word, syllables, ...(loanSyllables.length > 0 && { loanSyllables }) });
    }
  }
  if (headwords.length === 0) throw new EntryError("no valid headword reading");
  return headwords;
}

interface ExampleBlock {
  readonly yue: string[];
  readonly zho: string[];
}

/**
 * One sense: an optional "<explanation>" line, clause lines (exactly one yue:), then "<eg>" blocks.
 * Each yue: line in a block becomes one example; the block's zho: line (at most one) goes on each.
 * A block without a yue: line (Mandarin- or English-only) yields no example.
 */
function parseSense(lines: readonly string[], report: (message: string) => void): WordshkSense {
  let explanation: string[] | undefined;
  const blocks: ExampleBlock[] = [];
  /** What a continuation line extends: the yue: explanation, an ignored clause, or nothing it may extend. */
  let continues: "explanation" | "ignored" | "none" = "none";

  for (const [index, line] of lines.entries()) {
    if (line === EXPLANATION_MARKER && index === 0) continue;
    if (line === EXPLANATION_MARKER) throw new EntryError(`unexpected ${EXPLANATION_MARKER} inside a sense`);
    if (line === EXAMPLE_MARKER) {
      blocks.push({ yue: [], zho: [] });
      continues = "none";
      continue;
    }
    const clause = CLAUSE.exec(line);
    if (clause === null) {
      if (continues === "explanation") explanation?.push(line);
      else if (continues === "none") throw new EntryError(`unexpected line "${line}"`);
      continue;
    }
    const [, lang, text] = clause;
    const block = blocks.at(-1);
    if (block === undefined) {
      if (lang !== "yue") {
        continues = "ignored";
      } else if (explanation !== undefined) {
        throw new EntryError("two yue: explanations in one sense");
      } else {
        explanation = [text];
        continues = "explanation";
      }
    } else if (lang === "yue" || lang === "zho") {
      if (lang === "zho" && block.zho.length > 0) throw new EntryError(`two zho: lines in one ${EXAMPLE_MARKER}`);
      block[lang].push(text);
      continues = "none";
    } else {
      continues = "ignored";
    }
  }

  if (explanation === undefined) throw new EntryError("sense has no yue: explanation");
  const yue = stripLinks(explanation.join("\n").trim());
  if (yue === "") throw new EntryError("empty yue: explanation");

  const examples: WordshkExample[] = [];
  for (const block of blocks) {
    const zho = block.zho.length > 0 ? stripLinks(splitJyutping(block.zho[0]).text) : undefined;
    for (const line of block.yue) {
      const { text, jyutping } = splitJyutping(line);
      if (text === "") throw new EntryError(`empty yue: line in ${EXAMPLE_MARKER}`);
      let syllables: { jyutping: string[]; loanSyllables: number[] } | undefined;
      if (jyutping !== undefined) {
        const parsed = parseLoanAwareSyllables(jyutpingCells(jyutping));
        if (parsed.kind !== "ok") {
          report(`${describeBadSyllable(parsed.kind, parsed.cell)} in example Jyutping "${jyutping}"; example dropped`);
          continue;
        }
        syllables = { jyutping: parsed.syllables, loanSyllables: parsed.loanSyllables };
      }
      examples.push({
        yue: stripLinks(text),
        ...(syllables !== undefined && { jyutping: syllables.jyutping }),
        ...(syllables !== undefined && syllables.loanSyllables.length > 0 && { loanSyllables: syllables.loanSyllables }),
        ...(zho !== undefined && { zho }),
      });
    }
  }
  return { yue, examples };
}

/** The entry column: a tag line, then senses separated by "----" lines. */
function parseContent(content: string, report: (message: string) => void): Pick<WordshkEntry, "pos" | "labels" | "senses"> {
  if (content === NO_DATA) throw new EntryError(`no content ("${NO_DATA}")`);
  const [tagLine, ...body] = content.split(/\r?\n/);
  if (!TAG_LINE.test(tagLine)) throw new EntryError(`expected a tag line like "(pos:名詞)", got "${tagLine}"`);
  const pos: string[] = [];
  const labels: string[] = [];
  for (const [, name, value] of tagLine.matchAll(TAG)) {
    if (name === "pos") pos.push(value);
    else if (name === "label") labels.push(value);
    else if (!IGNORED_TAGS.has(name)) throw new EntryError(`unknown tag "${name}"`);
  }

  const senseLines: string[][] = [[]];
  for (const line of body) {
    if (line === SENSE_SEPARATOR) senseLines.push([]);
    else senseLines[senseLines.length - 1].push(line);
  }
  return { pos, labels, senses: senseLines.map((lines) => parseSense(lines, report)) };
}

/** The 1-based line a CSV record starts on (csv-parse reports the line it ends on). */
function startLine({ info, raw }: CsvRecord): number {
  return info.lines - (raw.match(/\n/g)?.length ?? 0);
}

/**
 * Parses the words.hk full dump CSV (all-*.csv after gunzip). It has no header row: the first
 * record is a notice (`,,"--- Generated …"`), the second an empty quoted field, then one record per
 * entry with columns id, headwords, entry, variants, warning, public. Fields are CSV-quoted and
 * the entry field spans many lines, so this uses csv-parse rather than splitting lines.
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
 *   reading with a bad syllable, an example whose Jyutping has a bad syllable, or the whole entry
 *   for broken markup (no tag line, unknown tag, stray line, sense without yue:, …).
 */
export function parseWordshkDump(csvText: string): Parsed<WordshkEntry> {
  let records: CsvRecord[];
  try {
    // With info + raw, csv-parse returns { record, info, raw } objects; its typings only model string[][].
    records = parse(csvText, { bom: true, relax_column_count: true, info: true, raw: true }) as unknown as CsvRecord[];
  } catch (err) {
    const line = (err as { lines?: unknown }).lines;
    throwIfProblems(SOURCE_NAME, [{ line: typeof line === "number" ? line : 0, message: (err as Error).message }]);
    throw err;
  }

  const notice = records[0]?.record[2];
  if (notice === undefined || !notice.startsWith(NOTICE_PREFIX)) {
    throwIfProblems(SOURCE_NAME, [{ line: 1, message: `expected a first record whose third field starts with "${NOTICE_PREFIX}"` }]);
  }

  const rows: WordshkEntry[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];
  const seenIds = new Set<number>();

  for (const csvRecord of records.slice(1)) {
    const fields = csvRecord.record;
    const line = startLine(csvRecord);
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
      rows.push({ id, headwords, variants, ...parseContent(content, report) });
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
