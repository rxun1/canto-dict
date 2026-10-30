import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createGunzip } from "node:zlib";
import { readTarEntries } from "../tar";
import { LuaSyntaxError, readExportList, type LuaDataEntry } from "./luaDataModule";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import type { DialSynForm, DialSynPair } from "./types";
import { WIKTIONARY_DIALSYN_SHA256, WIKTIONARY_DIALSYN_TAR_DIR, WIKTIONARY_DIALSYN_URL } from "./urls";

const SOURCE_NAME = "Wiktionary dial-syn";

/** Page-name prefix of the tables, for problem messages. */
const MODULE_PREFIX = "Module:zh/data/dial-syn/";

/** The Written Standard Chinese row (rendered "Formal (Written Standard Chinese)"). */
const FORMAL_KEY = "Formal";

/** A Formal row of exactly "-" means the table has no Written Standard form. */
const NO_FORMAL = "-";

/**
 * Location keys of urban Cantonese in Module:zh/data/dial (group "Cantonese"), in output order.
 * Deliberately not kept: that group's Hong Kong village dialects (HK Weitou, Kam Tin, Shek Pik,
 * Ting Kok, Tung Ping Chau), Tanka boat dialects (Sam Mun Tsai, Macau-Tanka) and Guangzhou's
 * suburban districts (Guangzhou-XJ, …), plus same-named places of other varieties (Hong Kong-H is
 * Hakka).
 */
export const CANTONESE_LOCATION_KEYS = ["Hong Kong", "Guangzhou", "Macau"] as const;

/** Sense suffix of a module name ("張-2"), which Wiktionary drops when it shows the title. */
const SENSE_SUFFIX = /-\d+$/;

/** [[target]] or [[target|label]] links (sum-of-parts forms like [[聽日]][[下晝]]); keeps the shown text. */
const WIKILINK = /\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]/g;

/** One module from the tarball: its page name below Module:zh/data/dial-syn/ (e.g. "沒有", "張-2") and its source. */
export interface DialSynModule {
  readonly name: string;
  readonly text: string;
}

/**
 * The form and note inside one Wiktionary synonym item, following the zh-dial-syn renderer: the
 * item splits on ":" into the form and its note (the text up to any second ":"), "_N" after the form
 * picks an etymology section ("肥腯腯_1") and [[…]] marks links. Notes are usage labels ("撳芯筆:
 * regional", "四眼佬:man", "冇:dated"), regions ("充電寶:Mainland China") or per-table footnote
 * symbols (":†", ":‡", ":<"); they are trimmed and kept, an empty note is dropped. Latin letters,
 * spaces and "……" placeholders stay in the form: they are part of real forms (阿Sir, QR code, 話……知).
 */
export function cleanDialSynForm(raw: string): DialSynForm {
  const [withEtymology = "", rawNote] = raw.split(":");
  const [form = ""] = withEtymology.split("_");
  const cleaned = form.replace(WIKILINK, "$1").trim();
  const note = rawNote?.trim() ?? "";
  return note === "" ? { form: cleaned } : { form: cleaned, note };
}

/** Drops empty forms and later repeats of a form, keeping each form's first occurrence (and its note). */
function uniqueForms(forms: readonly DialSynForm[]): DialSynForm[] {
  const seen = new Set<string>();
  return forms.filter(({ form }) => form !== "" && !seen.has(form) && seen.add(form));
}

/** The cleaned forms of a row; [] when absent or when its first item is "" (how Wiktionary marks an empty row). */
function rowForms(entry: LuaDataEntry | undefined): DialSynForm[] {
  if (entry === undefined || typeof entry.value === "string" || entry.value[0] === "") return [];
  return uniqueForms(entry.value.map(cleanDialSynForm));
}

/**
 * Parses Wiktionary's Chinese dialectal-synonym tables (Module:zh/data/dial-syn/<word>, Lua data
 * modules read by readExportList, never executed) into Mandarin -> Cantonese pairs.
 *
 * For each table, the Written Standard Chinese forms come from its "Formal" row; { "" } there means
 * the page name (minus a "-2" sense suffix) and { "-" } means none. The Cantonese forms are the
 * Hong Kong, Guangzhou and Macau rows merged in that order. Forms are cleaned by cleanDialSynForm
 * and de-duplicated on the form: the first occurrence wins with its note, so when the same form
 * appears with different notes (or with and without one) the Hong Kong row's version is kept. Notes
 * are kept on Cantonese forms only; Written Standard forms become plain strings. A table yields one pair per Written Standard form, and nothing when it has no
 * Written Standard form or no Cantonese form (not a problem: most tables cover only some varieties).
 *
 * Severity policy:
 * - STRUCTURAL problems (no modules at all; no parsed table having any Hong Kong, Guangzhou or Macau
 *   row, i.e. the location keys were renamed) are thrown.
 * - ROW-LEVEL problems skip the whole table, recorded with the module name and a 1-based line
 *   within it: a module that is not a data table of the expected shape (a redirect stub, a Lua
 *   syntax error, an unsupported construct), a used row that is a string instead of a list, or a
 *   missing Formal row (Wiktionary's own renderer fails on that).
 */
export function parseDialSynModules(modules: readonly DialSynModule[]): Parsed<DialSynPair> {
  const rows: DialSynPair[] = [];
  const skipped: Problem[] = [];
  if (modules.length === 0) throwIfProblems(SOURCE_NAME, [{ line: 1, message: "no dial-syn modules found" }]);

  let parsedTables = 0;
  let tablesWithCantoneseKey = 0;
  for (const { name, text } of modules) {
    const skip = (line: number, message: string): void => {
      skipped.push({ line, message: `${MODULE_PREFIX}${name}: ${message}` });
    };
    let fields: ReadonlyMap<string, LuaDataEntry>;
    try {
      fields = readExportList(text);
    } catch (err) {
      if (!(err instanceof LuaSyntaxError)) throw err;
      skip(err.line, err.message);
      continue;
    }
    parsedTables++;
    if (CANTONESE_LOCATION_KEYS.some((key) => fields.has(key))) tablesWithCantoneseKey++;

    const formal = fields.get(FORMAL_KEY);
    if (formal === undefined) {
      skip(1, `no "${FORMAL_KEY}" (Written Standard Chinese) row`);
      continue;
    }
    const notList = [FORMAL_KEY, ...CANTONESE_LOCATION_KEYS].find((key) => typeof fields.get(key)?.value === "string");
    if (notList !== undefined) {
      skip(fields.get(notList)!.line, `row "${notList}" is not a list of forms`);
      continue;
    }

    const formalItems = formal.value as readonly string[];
    if (formalItems[0] === NO_FORMAL) continue;
    const mandarin = formalItems[0] === "" ? [name.replace(SENSE_SUFFIX, "")] : rowForms(formal).map(({ form }) => form);
    const cantonese = uniqueForms(CANTONESE_LOCATION_KEYS.flatMap((key) => rowForms(fields.get(key))));
    if (cantonese.length === 0) continue;
    for (const form of mandarin) rows.push({ mandarin: form, cantonese });
  }

  if (parsedTables > 0 && tablesWithCantoneseKey === 0) {
    const keys = CANTONESE_LOCATION_KEYS.map((key) => `"${key}"`);
    throwIfProblems(SOURCE_NAME, [
      { line: 1, message: `none of the ${parsedTables} parsed tables has a ${keys.slice(0, -1).join(", ")} or ${keys.at(-1)} row (location keys renamed?)` },
    ]);
  }
  return { rows, skipped };
}

/** Tarball path of a table: directly in WIKTIONARY_DIALSYN_TAR_DIR, named <page>.txt (subpages excluded). */
function moduleName(path: string): string | undefined {
  const relative = path.replace(/^\.\//, "");
  if (!relative.startsWith(WIKTIONARY_DIALSYN_TAR_DIR) || !relative.endsWith(".txt")) return undefined;
  const name = relative.slice(WIKTIONARY_DIALSYN_TAR_DIR.length, -".txt".length);
  return name === "" || name.includes("/") ? undefined : name;
}

/** Streams the gzipped module tarball at `path` and returns its dial-syn tables (UTF-8, checked). */
export async function readDialSynTarball(path: string): Promise<DialSynModule[]> {
  const entries = await readTarEntries(createReadStream(path).pipe(createGunzip()), (p) => moduleName(p) !== undefined);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return entries.map(({ path: entryPath, data }) => ({ name: moduleName(entryPath)!, text: decoder.decode(data) }));
}

/**
 * The committed extract: parseDialSynModules' output over the pinned tarball, written by
 * scripts/gen-dialsyn.ts. kaikki keeps no old tarballs, so the pipeline reads this file rather than
 * the download, and a fresh checkout builds offline.
 */
export const DIALSYN_EXTRACT_PATH = resolve(import.meta.dirname, "../../data/wiktionary-dialsyn.json");

const EXTRACT_SOURCE_NAME = `${SOURCE_NAME} extract`;

/** Provenance written at the top of the extract; tarballSha256 must match the pin in urls.ts. */
const EXTRACT_ABOUT = {
  source: WIKTIONARY_DIALSYN_URL,
  tarballSha256: WIKTIONARY_DIALSYN_SHA256,
  tables: `${MODULE_PREFIX}*`,
  license: "CC BY-SA 4.0 (Wiktionary)",
  regenerate: "cd data-pipeline && npx tsx scripts/gen-dialsyn.ts",
} as const;

/** 1-based line of the first pair in formatDialSynExtract's layout (after "{", about, pairCount, "pairs": [). */
const FIRST_PAIR_LINE = 5;

/** A pair as one JSON line, with keys in a fixed order (form, then note only when present). */
function pairLine({ mandarin, cantonese }: DialSynPair): string {
  return JSON.stringify({ mandarin, cantonese: cantonese.map(({ form, note }) => (note === undefined ? { form } : { form, note })) });
}

/** Code-unit order: deterministic, unlike localeCompare. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Serializes pairs as the extract: a provenance object, the pair count and one pair per line, sorted
 * by Mandarin and then by the line itself, so the output depends only on the set of pairs and
 * regenerating after an upstream change gives a reviewable line diff.
 */
export function formatDialSynExtract(pairs: readonly DialSynPair[]): string {
  const sorted = pairs
    .map((pair) => ({ mandarin: pair.mandarin, line: pairLine(pair) }))
    .sort((a, b) => byCodeUnits(a.mandarin, b.mandarin) || byCodeUnits(a.line, b.line))
    .map(({ line }) => `    ${line}`);
  const body = sorted.length === 0 ? "[]" : `[\n${sorted.join(",\n")}\n  ]`;
  return `{\n  "about": ${JSON.stringify(EXTRACT_ABOUT)},\n  "pairCount": ${pairs.length},\n  "pairs": ${body}\n}\n`;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value !== "";

/** True for {form: non-empty string} or {form, note: non-empty string}, with no other keys. */
function isForm(value: unknown): value is DialSynForm {
  if (!isObject(value) || !isNonEmptyString(value.form)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => key === "form" || key === "note") && (!("note" in value) || isNonEmptyString(value.note));
}

/**
 * Reads and validates the extract written by formatDialSynExtract. Every problem is structural (the
 * file is generated, so any defect means it was edited or is stale) and all are thrown together:
 * invalid JSON, a wrong top-level shape, provenance not matching the pin in urls.ts, a pairCount that
 * disagrees with the pairs, or a malformed pair (line numbers assume the generated layout).
 */
export function parseDialSynExtract(text: string): DialSynPair[] {
  const fail = (line: number, message: string): never => {
    throwIfProblems(EXTRACT_SOURCE_NAME, [{ line, message }]);
    throw new Error("unreachable");
  };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail(1, "not valid JSON");
  }
  if (!isObject(data) || !isObject(data.about) || typeof data.pairCount !== "number" || !Array.isArray(data.pairs)) {
    return fail(1, 'expected an object with "about", "pairCount" and "pairs"');
  }
  const problems: Problem[] = [];
  if (data.about.tarballSha256 !== WIKTIONARY_DIALSYN_SHA256) {
    problems.push({ line: 2, message: `extract was generated from tarball sha256 ${String(data.about.tarballSha256)}, but urls.ts pins ${WIKTIONARY_DIALSYN_SHA256}; regenerate it` });
  }
  if (data.pairCount !== data.pairs.length) {
    problems.push({ line: 3, message: `pairCount is ${data.pairCount} but there are ${data.pairs.length} pairs` });
  }
  const pairs: DialSynPair[] = [];
  for (const [index, pair] of data.pairs.entries()) {
    const at = { line: FIRST_PAIR_LINE + index, label: `pair ${index + 1}` };
    if (!isObject(pair) || !isNonEmptyString(pair.mandarin)) {
      problems.push({ line: at.line, message: `${at.label}: mandarin must be a non-empty string` });
      continue;
    }
    if (!Array.isArray(pair.cantonese) || pair.cantonese.length === 0) {
      problems.push({ line: at.line, message: `${at.label}: cantonese must be a non-empty list` });
      continue;
    }
    const bad = pair.cantonese.findIndex((form) => !isForm(form));
    if (bad !== -1) {
      problems.push({ line: at.line, message: `${at.label}: cantonese form ${bad + 1} must be {"form": non-empty string, "note"?: non-empty string}` });
      continue;
    }
    pairs.push({ mandarin: pair.mandarin, cantonese: pair.cantonese as DialSynForm[] });
  }
  throwIfProblems(EXTRACT_SOURCE_NAME, problems);
  return pairs;
}

/** Reads the committed extract (no network); regenerate it with scripts/gen-dialsyn.ts. */
export async function loadWiktionaryDialSyn(): Promise<DialSynPair[]> {
  return parseDialSynExtract(await readFile(DIALSYN_EXTRACT_PATH, "utf8"));
}
