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
export const MOEDICT_ATTRIBUTION = `中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號：${MOEDICT_RELEASE}）網址： http://dict.revised.moe.edu.tw/`;

/**
 * Rare characters the source shows as an image reference ("&3898_.gif;") or a placeholder
 * ("{[8ff0]}") instead of text. Some of these name characters Unicode does encode (&22471_.gif;),
 * but the source does not give the character itself.
 */
const PLACEHOLDER = /\{\[[0-9a-fA-F]+\]\}|&[0-9a-fA-F]+_\.gif;/;

/** Private Use Area code points, the MoE's own encoding of rare characters (e.g. U+F06EB); they show as tofu. */
const PRIVATE_USE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

/** How skip messages describe a rare character; the skip policy is the same for all three forms. */
const RARE_CHARACTER_NOTE = "a character the source shows as an image, placeholder or private-use character";

/** Zero-width characters, invisible encoding debris: about 950 of them in 220 definitions (U+FEFF mostly; U+200B in 5). */
const ZERO_WIDTH = /[\u200B\uFEFF]/g;

/** Strips zero-width characters and surrounding whitespace; nothing else is changed (the license forbids it). */
const clean = (text: string): string => text.replace(ZERO_WIDTH, "").trim();

/** The first rare character in `text` for a message (a placeholder as written, a private-use code point as U+XXXX), or undefined. */
function findRareCharacter(text: string): string | undefined {
  const placeholder = PLACEHOLDER.exec(text);
  const privateUse = PRIVATE_USE.exec(text);
  if (privateUse !== null && (placeholder === null || privateUse.index < placeholder.index)) {
    return `U+${privateUse[0].codePointAt(0)!.toString(16).toUpperCase()}`;
  }
  return placeholder?.[0];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A definition as the source writes it (the fields we read, checked for shape), with its 0-based heteronym index. */
interface RawDefinition {
  readonly heteronym: number;
  readonly def: string;
  readonly type?: string;
  readonly link?: unknown;
}

/**
 * The entry's definitions in file order across all heteronyms, or a description of what is wrong
 * with its shape (no heteronyms; a heteronym that is not an object or has no or an empty definitions
 * list; a definition that is not an object or has no def string; a type that is present but not a
 * non-blank string). The pinned file has none of these, so each means the format changed.
 */
function readDefinitions(heteronyms: readonly unknown[]): RawDefinition[] | string {
  if (heteronyms.length === 0) return "no heteronyms";
  const definitions: RawDefinition[] = [];
  for (const [h, heteronym] of heteronyms.entries()) {
    if (!isObject(heteronym) || !Array.isArray(heteronym.definitions)) return `heteronym ${h + 1} has no definitions list`;
    if (heteronym.definitions.length === 0) return `heteronym ${h + 1} has no definitions`;
    for (const [d, definition] of heteronym.definitions.entries()) {
      const at = `heteronym ${h + 1}, definition ${d + 1}`;
      if (!isObject(definition) || typeof definition.def !== "string") return `${at} has no def string`;
      if (definition.type !== undefined && (typeof definition.type !== "string" || definition.type.trim() === "")) {
        return `${at} has a type that is not a non-blank string: ${JSON.stringify(definition.type)}`;
      }
      const { def, type, link } = definition as { def: string; type?: string; link?: unknown };
      definitions.push({ heteronym: h, def, type, link });
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
 * order, each with its heteronym's 0-based index and its `type` as `pos` (verbatim, untrimmed).
 * Text is kept verbatim (CC BY-ND) except for removing zero-width characters and surrounding
 * whitespace. The data has no link markup (no backtick/tilde markers like "`學~`校~"), so a "~" is
 * always text, as in 楊堅's "西元541~604". Entry problems carry `unit: "entry"` and the entry's
 * 1-based position in the array as `line`; problems with the file as a whole are on line 1.
 *
 * Severity policy:
 * - STRUCTURAL problems (not valid JSON; not a non-empty array; an entry that is not an object or
 *   has no title string or heteronyms list; an empty title; a headword that repeats an earlier one
 *   after cleaning; the shape problems listed at readDefinitions) mean we misunderstand the format,
 *   so they are collected and thrown once.
 * - ROW-LEVEL problems are expected in real data and skipped: an entry whose headword has a rare
 *   character (PLACEHOLDER or PRIVATE_USE) is dropped; a sense whose definition has one, or whose def is
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

  /** First entry number of each cleaned headword, to report repeats. */
  const firstSeen = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    const line = index + 1;
    const problemAt = (message: string): Problem => ({ line, unit: "entry", message });
    if (!isObject(entry) || typeof entry.title !== "string" || !Array.isArray(entry.heteronyms)) {
      structural.push(problemAt("expected an entry with a title string and a heteronyms list"));
      continue;
    }
    const word = clean(entry.title);
    if (word === "") {
      structural.push(problemAt(`empty title ${JSON.stringify(entry.title)}`));
      continue;
    }
    const first = firstSeen.get(word);
    if (first !== undefined) {
      structural.push(problemAt(`duplicate headword ${word} (first at entry ${first})`));
      continue;
    }
    firstSeen.set(word, line);
    const definitions = readDefinitions(entry.heteronyms);
    if (typeof definitions === "string") {
      structural.push(problemAt(`${word}: ${definitions}`));
      continue;
    }
    const rare = findRareCharacter(word);
    if (rare !== undefined) {
      skipped.push(problemAt(`headword ${JSON.stringify(word)} has ${RARE_CHARACTER_NOTE} (${rare})`));
      continue;
    }

    const senses: MoeSense[] = [];
    for (const [d, { heteronym, def: rawDef, type, link }] of definitions.entries()) {
      const def = clean(rawDef);
      const at = `${word} sense ${d + 1}`;
      const rareInDef = findRareCharacter(def);
      if (rareInDef !== undefined) {
        skipped.push(problemAt(`${at}: definition has ${RARE_CHARACTER_NOTE} (${rareInDef})`));
        continue;
      }
      if (def === "") {
        const reference = linkText(link);
        skipped.push(problemAt(`${at}: empty definition${reference === undefined ? "" : ` (cross-reference only: ${reference})`}`));
        continue;
      }
      senses.push(type === undefined ? { heteronym, def } : { heteronym, pos: type, def });
    }
    if (senses.length > 0) rows.push({ word, senses });
  }

  throwIfProblems(SOURCE_NAME, structural);
  return { rows, skipped };
}

/**
 * Decompresses the xz file at `path` and decodes it as UTF-8. A file the decoder rejects (corrupt,
 * truncated, not xz) or bytes that are not UTF-8 reject with a message naming the file, the
 * original error as `cause`; file-system errors such as ENOENT pass through unchanged.
 */
export async function readXzText(path: string): Promise<string> {
  const compressed = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  let bytes: ArrayBuffer;
  try {
    bytes = await new Response(new XzReadableStream(compressed)).arrayBuffer();
  } catch (err) {
    // Only file-system errors (string code plus syscall, e.g. ENOENT from open) are not the decoder's.
    if (err instanceof Error && typeof (err as NodeJS.ErrnoException).code === "string" && "syscall" in err) throw err;
    throw new Error(`could not decompress ${path} (corrupt or truncated xz; delete it to re-download)`, { cause: err });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (err) {
    throw new Error(`${path} is not valid UTF-8`, { cause: err });
  }
}

/** Fetches (or reuses the cached) pinned dict-revised.json.xz, decompresses it and parses it. */
export async function loadMoedict(): Promise<MoeEntry[]> {
  const path = await fetchToCache(MOEDICT_URL, MOEDICT_CACHE_NAME);
  return keptRows(SOURCE_NAME, parseMoedict(await readXzText(path)));
}
