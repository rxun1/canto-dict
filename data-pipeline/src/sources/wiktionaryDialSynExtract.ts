// The committed Wiktionary dial-syn extract (data/wiktionary-dialsyn.json): its format, validation and
// the pipeline's loader. Build-time code imports only this module, so it must not import the tarball
// side (wiktionaryDialSyn.ts), zlib, the tar reader or the Lua parser.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { throwIfProblems, type Problem } from "./problems";
import type { DialSynForm, DialSynPair } from "./types";
import { WIKTIONARY_DIALSYN_PAGE_PREFIX, WIKTIONARY_DIALSYN_SHA256, WIKTIONARY_DIALSYN_URL } from "./urls";

/**
 * The committed extract: parseDialSynModules' output over the pinned tarball, written by
 * scripts/gen-dialsyn.ts. kaikki keeps no old tarballs, so the pipeline reads this file rather than
 * the download, and a fresh checkout builds offline.
 */
export const DIALSYN_EXTRACT_PATH = resolve(import.meta.dirname, "../../data/wiktionary-dialsyn.json");

const EXTRACT_SOURCE_NAME = "Wiktionary dial-syn extract";

/** Provenance written at the top of the extract; tarballSha256 is the hash of the tarball it was built from. */
const extractAbout = (tarballSha256: string) => ({
  source: WIKTIONARY_DIALSYN_URL,
  tarballSha256,
  tables: `${WIKTIONARY_DIALSYN_PAGE_PREFIX}*`,
  license: "CC BY-SA 4.0 (Wiktionary)",
  regenerate: "cd data-pipeline && npx tsx scripts/gen-dialsyn.ts",
});

/** 1-based line of the first pair in formatDialSynExtract's layout (after "{", about, pairCount, "pairs": [). */
const FIRST_PAIR_LINE = 5;

/** A pair as one JSON line, with keys in a fixed order (form, then note only when present). */
function pairLine({ mandarin, cantonese }: DialSynPair): string {
  return JSON.stringify({ mandarin, cantonese: cantonese.map(({ form, note }) => (note === undefined ? { form } : { form, note })) });
}

/** Code-unit order: deterministic, unlike localeCompare. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Serializes pairs as the extract: a provenance object (with `tarballSha256`, the hash of the
 * tarball the pairs came from), the pair count and one pair per line, sorted by Mandarin and then by
 * the line itself, with exact duplicate pairs (the same Mandarin and Cantonese list from two tables,
 * e.g. 個 -> 隻) written once. The output depends only on the set of pairs, so regenerating after an
 * upstream change gives a reviewable line diff.
 */
export function formatDialSynExtract(pairs: readonly DialSynPair[], tarballSha256: string): string {
  const lines = pairs
    .map((pair) => ({ mandarin: pair.mandarin, line: pairLine(pair) }))
    .sort((a, b) => byCodeUnits(a.mandarin, b.mandarin) || byCodeUnits(a.line, b.line))
    .map(({ line }) => line)
    .filter((line, i, sorted) => line !== sorted[i - 1]);
  const body = lines.length === 0 ? "[]" : `[\n${lines.map((line) => `    ${line}`).join(",\n")}\n  ]`;
  return `{\n  "about": ${JSON.stringify(extractAbout(tarballSha256))},\n  "pairCount": ${lines.length},\n  "pairs": ${body}\n}\n`;
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
 * invalid JSON, a wrong top-level shape, a tarball hash other than `pinnedSha256` (by default the
 * pin in urls.ts), a pairCount that disagrees with the pairs, no pairs at all, or a malformed pair
 * (line numbers assume the generated layout).
 */
export function parseDialSynExtract(text: string, pinnedSha256: string = WIKTIONARY_DIALSYN_SHA256): DialSynPair[] {
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
  if (data.about.tarballSha256 !== pinnedSha256) {
    problems.push({ line: 2, message: `extract was generated from tarball sha256 ${String(data.about.tarballSha256)}, but urls.ts pins ${pinnedSha256}; regenerate it` });
  }
  if (data.pairCount !== data.pairs.length) {
    problems.push({ line: 3, message: `pairCount is ${data.pairCount} but there are ${data.pairs.length} pairs` });
  }
  if (data.pairs.length === 0) problems.push({ line: 4, message: "the extract has no pairs" });
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
