import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { fetchToCache } from "../download";
import { readTarEntries } from "../tar";
import { keptRows } from "./load";
import { LuaSyntaxError, readExportList, type LuaDataEntry } from "./luaDataModule";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import type { DialSynPair } from "./types";
import {
  WIKTIONARY_DIALSYN_CACHE_NAME,
  WIKTIONARY_DIALSYN_SHA256,
  WIKTIONARY_DIALSYN_TAR_DIR,
  WIKTIONARY_DIALSYN_URL,
} from "./urls";

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
 * The plain form inside one Wiktionary synonym item, following the zh-dial-syn renderer: text after
 * the first ":" is a note (usage labels such as "撳芯筆:regional" or "四眼佬:man", symbols such as
 * ":†" and ":‡", regions such as "充電寶:Mainland China"), "_N" picks an etymology section
 * ("肥腯腯_1"), and [[…]] marks links. Notes are dropped, so dated or obsolete forms are kept as
 * plain forms. Latin letters, spaces and "……" placeholders are kept: they are part of real forms
 * (阿Sir, QR code, 話……知).
 */
export function cleanDialSynForm(raw: string): string {
  const [withEtymology = ""] = raw.split(":");
  const [form = ""] = withEtymology.split("_");
  return form.replace(WIKILINK, "$1").trim();
}

/** The cleaned, de-duplicated forms of a row; [] when absent or when its first item is "" (how Wiktionary marks an empty row). */
function rowForms(entry: LuaDataEntry | undefined): string[] {
  if (entry === undefined || typeof entry.value === "string" || entry.value[0] === "") return [];
  return [...new Set(entry.value.map(cleanDialSynForm).filter((form) => form !== ""))];
}

/**
 * Parses Wiktionary's Chinese dialectal-synonym tables (Module:zh/data/dial-syn/<word>, Lua data
 * modules read by readExportList, never executed) into Mandarin -> Cantonese pairs.
 *
 * For each table, the Written Standard Chinese forms come from its "Formal" row; { "" } there means
 * the page name (minus a "-2" sense suffix) and { "-" } means none. The Cantonese forms are the
 * Hong Kong, Guangzhou and Macau rows merged in that order. Forms are cleaned by cleanDialSynForm
 * and de-duplicated. A table yields one pair per Written Standard form, and nothing when it has no
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
    const mandarin = formalItems[0] === "" ? [name.replace(SENSE_SUFFIX, "")] : rowForms(formal);
    const cantonese = [...new Set(CANTONESE_LOCATION_KEYS.flatMap((key) => rowForms(fields.get(key))))];
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

/** Fetches (or reuses the cached, hash-checked) module tarball and parses its dial-syn tables. */
export async function loadWiktionaryDialSyn(): Promise<DialSynPair[]> {
  const path = await fetchToCache(WIKTIONARY_DIALSYN_URL, WIKTIONARY_DIALSYN_CACHE_NAME, { sha256: WIKTIONARY_DIALSYN_SHA256 });
  const modules = await readDialSynTarball(path);
  console.log(`${SOURCE_NAME}: read ${modules.length} tables`);
  return keptRows(SOURCE_NAME, parseDialSynModules(modules));
}
