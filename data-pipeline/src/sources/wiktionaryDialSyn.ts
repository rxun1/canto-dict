// Generator-only half of the Wiktionary dial-syn source: reads the kaikki tarball and turns its
// tables into pairs. Only scripts/gen-dialsyn.ts uses it; the pipeline reads the committed extract
// through wiktionaryDialSynExtract.ts, which needs none of zlib, the tar reader or the Lua parser.
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream";
import { createGunzip } from "node:zlib";
import { sha256OfFile } from "../download";
import { readTarEntries } from "../tar";
import { LuaSyntaxError, readExportList, type LuaDataEntry } from "./luaDataModule";
import { throwIfProblems, type Parsed, type Problem } from "./problems";
import type { DialSynForm, DialSynPair } from "./types";
import {
  WIKTIONARY_DIALSYN_PAGE_PREFIX,
  WIKTIONARY_DIALSYN_SHA256,
  WIKTIONARY_DIALSYN_TAR_DIR,
  WIKTIONARY_MODULE_TAR_SUFFIX,
} from "./urls";
import { formatDialSynExtract, parseDialSynExtract } from "./wiktionaryDialSynExtract";

const SOURCE_NAME = "Wiktionary dial-syn";

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
 * are kept on Cantonese forms only; Written Standard forms become plain strings. A table yields
 * one pair per Written Standard form, and nothing when it has no Written Standard form or no
 * Cantonese form (not a problem: most tables cover only some varieties). Also returns how many
 * modules parsed as tables, for the generator's sanity minimum.
 *
 * Severity policy:
 * - STRUCTURAL problems (no modules at all; no module parsing as a table; no parsed table having
 *   any Hong Kong, Guangzhou or Macau row, i.e. the location keys were renamed) are thrown.
 * - ROW-LEVEL problems skip the whole table, recorded with the module name and a 1-based line
 *   within it: a module that is not a data table of the expected shape (a redirect stub, a Lua
 *   syntax error, an unsupported construct), a used row that is a string instead of a list, or a
 *   missing Formal row (Wiktionary's own renderer fails on that).
 */
export function parseDialSynModules(modules: readonly DialSynModule[]): Parsed<DialSynPair> & { readonly parsedTables: number } {
  const rows: DialSynPair[] = [];
  const skipped: Problem[] = [];
  if (modules.length === 0) throwIfProblems(SOURCE_NAME, [{ line: 1, message: "no dial-syn modules found" }]);

  let parsedTables = 0;
  let tablesWithCantoneseKey = 0;
  for (const { name, text } of modules) {
    const skip = (line: number, message: string): void => {
      skipped.push({ line, message: `${WIKTIONARY_DIALSYN_PAGE_PREFIX}${name}: ${message}` });
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

  if (parsedTables === 0) {
    throwIfProblems(SOURCE_NAME, [{ line: 1, message: `none of the ${modules.length} modules parsed as a dial-syn table` }]);
  }
  if (tablesWithCantoneseKey === 0) {
    const keys = CANTONESE_LOCATION_KEYS.map((key) => `"${key}"`);
    throwIfProblems(SOURCE_NAME, [
      { line: 1, message: `none of the ${parsedTables} parsed tables has a ${keys.slice(0, -1).join(", ")} or ${keys.at(-1)} row (location keys renamed?)` },
    ]);
  }
  return { rows, skipped, parsedTables };
}

/** Tarball path of a table: directly in WIKTIONARY_DIALSYN_TAR_DIR, named <page>.txt (subpages excluded). */
function moduleName(path: string): string | undefined {
  const relative = path.replace(/^\.\//, "");
  if (!relative.startsWith(WIKTIONARY_DIALSYN_TAR_DIR) || !relative.endsWith(WIKTIONARY_MODULE_TAR_SUFFIX)) return undefined;
  const name = relative.slice(WIKTIONARY_DIALSYN_TAR_DIR.length, -WIKTIONARY_MODULE_TAR_SUFFIX.length);
  return name === "" || name.includes("/") ? undefined : name;
}

/**
 * Streams the gzipped module tarball at `path` and returns its dial-syn tables. A table that is not
 * valid UTF-8 is skipped (recorded with its page name); a missing file or a corrupt archive rejects.
 */
export async function readDialSynTarball(path: string): Promise<Parsed<DialSynModule>> {
  const gunzip = createGunzip();
  // pipeline (unlike .pipe) passes a read error such as ENOENT on to gunzip, so iterating it rejects;
  // the callback is required, and the error surfaces through readTarEntries instead.
  pipeline(createReadStream(path), gunzip, () => {});
  const entries = await readTarEntries(gunzip, (p) => moduleName(p) !== undefined);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows: DialSynModule[] = [];
  const skipped: Problem[] = [];
  for (const { path: entryPath, data } of entries) {
    const name = moduleName(entryPath)!;
    try {
      rows.push({ name, text: decoder.decode(data) });
    } catch {
      skipped.push({ line: 1, message: `${WIKTIONARY_DIALSYN_PAGE_PREFIX}${name}: not valid UTF-8` });
    }
  }
  return { rows, skipped };
}

/** Fewer parsed tables than this means the tarball or the parser is broken (the pinned copy has 3,768). */
export const MIN_PARSED_TABLES = 2000;

export interface DialSynExtractBuild {
  /** The extract file's text (formatDialSynExtract). */
  readonly text: string;
  readonly parsedTables: number;
  /** Distinct pairs written. */
  readonly pairCount: number;
  /** Modules skipped while reading or parsing. */
  readonly skipped: readonly Problem[];
}

/**
 * Everything scripts/gen-dialsyn.ts does short of writing: hashes the tarball at `path`, checks the
 * hash against the pin, reads and parses its tables, checks the result and formats the extract with
 * the hash of the file actually read. Throws, so nothing is written, when the tarball is not the
 * pinned one (e.g. a CANTO_SRC_* override, which fetchToCache never hash-checks), when fewer than
 * `minParsedTables` tables parse, when no pairs come out, or when the text does not read back.
 */
export async function buildDialSynExtract(
  path: string,
  { minParsedTables = MIN_PARSED_TABLES, pinnedSha256 = WIKTIONARY_DIALSYN_SHA256 }: { minParsedTables?: number; pinnedSha256?: string } = {},
): Promise<DialSynExtractBuild> {
  const sha256 = await sha256OfFile(path);
  if (sha256 !== pinnedSha256) {
    throw new Error(`tarball sha256 ${sha256} is not the pinned WIKTIONARY_DIALSYN_SHA256 ${pinnedSha256}; update the pin in urls.ts first`);
  }
  const read = await readDialSynTarball(path);
  const { rows, skipped, parsedTables } = parseDialSynModules(read.rows);
  if (parsedTables < minParsedTables) throw new Error(`only ${parsedTables} dial-syn tables parsed, expected at least ${minParsedTables}`);
  if (rows.length === 0) throw new Error(`no pairs came out of ${parsedTables} parsed tables`);
  const text = formatDialSynExtract(rows, sha256);
  const pairs = parseDialSynExtract(text, sha256);
  if (formatDialSynExtract(pairs, sha256) !== text) throw new Error("the extract does not read back as written");
  return { text, parsedTables, pairCount: pairs.length, skipped: [...read.skipped, ...skipped] };
}
