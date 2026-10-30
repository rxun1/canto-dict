import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
// xz-decompress is a CommonJS bundle whose named exports Node cannot detect, so import it whole.
import xzDecompress from "xz-decompress";
import { fetchToCache } from "../download";
import { keptRows } from "./load";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import type { MoeEntry, MoeSense } from "./types";
import { MOEDICT_CACHE_NAME, MOEDICT_RELEASE, MOEDICT_URL } from "./urls";

const { XzReadableStream } = xzDecompress;

const SOURCE_NAME = "MoE 重編國語辭典";

/**
 * The credit the MoE's usage notes (《重編國語辭典修訂本》公眾授權使用說明, 一(三)) require, in their
 * format: "中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號： ）網址：
 * http://dict.revised.moe.edu.tw/", with the release we use filled in. The notes also ask that
 * anyone redistributing the data keep the usage notes with it.
 */
export const MOEDICT_ATTRIBUTION = `中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號：${MOEDICT_RELEASE}）網址：http://dict.revised.moe.edu.tw/`;

/**
 * Characters the source cannot show as Unicode text: "{[8ff0]}" placeholders, "&3898_.gif;" image
 * references (both name a glyph only the MoE has) and Private Use Area code points (the MoE's own
 * encoding of unencoded characters, e.g. U+F06EB). Text containing one would show garbage or tofu.
 */
const RARE_CHARACTER = /\{\[[0-9a-fA-F]+\]\}|&[0-9a-fA-F]+_\.gif;|[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

/** Zero-width characters scattered through about 950 definitions (U+FEFF mostly, U+200B in 5): invisible encoding debris. */
const ZERO_WIDTH = /[\u200B\uFEFF]/g;

/** Strips zero-width characters and surrounding whitespace; nothing else is changed (the license forbids it). */
const clean = (text: string): string => text.replace(ZERO_WIDTH, "").trim();

/** A rare character as it should read in a message: placeholders as written, a PUA code point as U+XXXX. */
function describeRareCharacter(match: string): string {
  const codePoint = match.codePointAt(0)!;
  return String.fromCodePoint(codePoint) === match ? `U+${codePoint.toString(16).toUpperCase()}` : match;
}

/** The first rare character in `text` as describeRareCharacter shows it, or undefined. */
function findRareCharacter(text: string): string | undefined {
  const match = RARE_CHARACTER.exec(text);
  return match === null ? undefined : describeRareCharacter(match[0]);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A definition as the source writes it: the fields we read, checked for shape. */
interface RawDefinition {
  readonly def: string;
  readonly type?: string;
  readonly link?: unknown;
}

/**
 * The entry's definitions in file order across all heteronyms, or a description of what is wrong
 * with its shape (a heteronym or definition that is not an object, no definitions list, a def that
 * is not a string, a type that is present but not a string).
 */
function readDefinitions(heteronyms: readonly unknown[]): RawDefinition[] | string {
  const definitions: RawDefinition[] = [];
  for (const [h, heteronym] of heteronyms.entries()) {
    if (!isObject(heteronym) || !Array.isArray(heteronym.definitions)) return `heteronym ${h + 1} has no definitions list`;
    for (const [d, definition] of heteronym.definitions.entries()) {
      const at = `heteronym ${h + 1}, definition ${d + 1}`;
      if (!isObject(definition) || typeof definition.def !== "string") return `${at} has no def string`;
      if (definition.type !== undefined && typeof definition.type !== "string") return `${at} has a type that is not a string`;
      definitions.push(definition as unknown as RawDefinition);
    }
  }
  return definitions;
}

/** The text of a definition's cross-reference ("link": ["同「姪」。"]), for reporting an empty def. */
function linkText(link: unknown): string | undefined {
  return Array.isArray(link) && link.every((item) => typeof item === "string") && link.length > 0 ? link.join("") : undefined;
}

/**
 * Parses g0v's dict-revised.json, the MoE's 《重編國語辭典修訂本》 as one JSON array of entries
 * `{ title, heteronyms: [{ bopomofo?, pinyin?, definitions: [{ def, type?, example?, quote?, link?,
 * synonyms?, antonyms? }] }], radical?, stroke_count?, non_radical_stroke_count? }`, into one
 * MoeEntry per entry: the title as `word` and every heteronym's definitions as senses in file
 * order, each with its `type` as `pos`. Text is kept verbatim (CC BY-ND) except for removing
 * zero-width characters and surrounding whitespace. The data has no link markup (no backtick/tilde
 * markers like "`學~`校~"), so a "~" is always text, as in 楊堅's "西元541~604".
 * Problems are located by the entry's 1-based position in the array, reported as its `line`.
 *
 * Severity policy:
 * - STRUCTURAL problems (not valid JSON; not a non-empty array; an entry that is not an object or
 *   has no title string or heteronyms list; an empty title; a heteronym without a definitions list;
 *   a definition without a def string or with a non-string type) mean we misunderstand the format,
 *   so they are collected and thrown once.
 * - ROW-LEVEL problems are expected in real data and skipped: an entry whose headword has a rare
 *   character (see RARE_CHARACTER) is dropped; a sense whose definition has one, or whose def is
 *   empty (the source then gives only a cross-reference, e.g. 同「姪」。), is dropped from its entry.
 *   Each is recorded in `skipped`. An entry left with no senses gives no row.
 */
export function parseMoedict(text: string): Parsed<MoeEntry> {
  const rows: MoeEntry[] = [];
  const skipped: Problem[] = [];
  const structural: Problem[] = [];

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throwIfProblems(SOURCE_NAME, [{ line: 1, message: "not valid JSON" }]);
  }
  if (!Array.isArray(data)) throwIfProblems(SOURCE_NAME, [{ line: 1, message: "expected a JSON array of entries" }]);
  const entries = data as unknown[];
  if (entries.length === 0) throwIfProblems(SOURCE_NAME, [{ line: 1, message: "the array has no entries" }]);

  for (const [index, entry] of entries.entries()) {
    const line = index + 1;
    if (!isObject(entry) || typeof entry.title !== "string" || !Array.isArray(entry.heteronyms)) {
      structural.push({ line, message: "expected an entry with a title string and a heteronyms list" });
      continue;
    }
    const word = clean(entry.title);
    if (word === "") {
      structural.push({ line, message: `empty title ${JSON.stringify(entry.title)}` });
      continue;
    }
    const definitions = readDefinitions(entry.heteronyms);
    if (typeof definitions === "string") {
      structural.push({ line, message: `${word}: ${definitions}` });
      continue;
    }
    const rare = findRareCharacter(word);
    if (rare !== undefined) {
      skipped.push({ line, message: `headword ${JSON.stringify(word)} has a character with no standard Unicode encoding (${rare})` });
      continue;
    }

    const senses: MoeSense[] = [];
    for (const [d, { def: rawDef, type, link }] of definitions.entries()) {
      const def = clean(rawDef);
      const at = `${word} sense ${d + 1}`;
      const rareInDef = findRareCharacter(def);
      if (rareInDef !== undefined) {
        skipped.push({ line, message: `${at}: definition has a character with no standard Unicode encoding (${rareInDef})` });
        continue;
      }
      if (def === "") {
        const reference = linkText(link);
        skipped.push({ line, message: `${at}: empty definition${reference === undefined ? "" : ` (cross-reference only: ${reference})`}` });
        continue;
      }
      senses.push(type === undefined ? { def } : { pos: type, def });
    }
    if (senses.length > 0) rows.push({ word, senses });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

/** Decompresses the xz file at `path` and decodes it as UTF-8, rejecting a corrupt file or invalid UTF-8. */
export async function readXzText(path: string): Promise<string> {
  const compressed = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  const bytes = await new Response(new XzReadableStream(compressed)).arrayBuffer();
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Fetches (or reuses the cached) pinned dict-revised.json.xz, decompresses it and parses it. */
export async function loadMoedict(): Promise<MoeEntry[]> {
  const path = await fetchToCache(MOEDICT_URL, MOEDICT_CACHE_NAME);
  return keptRows(SOURCE_NAME, parseMoedict(await readXzText(path)));
}
