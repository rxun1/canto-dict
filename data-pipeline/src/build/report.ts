// The build report, data-pipeline/build-report.html (spec §4.6): entries and rows per source, reading
// coverage, audio coverage (types and token-weighted, plus the syllables with no clip), DB and pack
// sizes, validation warnings and merge's counts. Docs are HTML, not markdown (plan conventions).
// Every interpolated value goes through escapeHtml.
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { byCodeUnits } from "../compare";
import type { Entry, MergeInputs, MergeStats, RowSource } from "../merge/types";
import {
  KAIFANGCIDIAN_SHA256,
  KAIFANGCIDIAN_URL,
  LSHK_URL,
  MOEDICT_URL,
  RIME_CHARS_URL,
  RIME_ESSAY_URL,
  RIME_WORDS_URL,
  UNIHAN_URL,
  WIKTIONARY_DIALSYN_SHA256,
  WIKTIONARY_DIALSYN_URL,
  WORDSHK_AUDIO_COMMIT,
  WORDSHK_AUDIO_TREE_SHA,
  WORDSHK_LIST_SHA256,
  WORDSHK_LIST_URL,
} from "../sources/urls";
import { MIN_SOURCE_ROWS } from "../validate";
import { BYTES_PER_MB } from "./audioPack";

/** Where cli.ts writes the report (next to package.json). */
export const REPORT_PATH = join(import.meta.dirname, "../../build-report.html");

/** Where each source comes from: a URL with the commit in it, or a URL plus the SHA-256 it is checked against. */
const SOURCE_ORIGINS: Readonly<Record<keyof MergeInputs, string>> = {
  rimeChars: RIME_CHARS_URL,
  lshk: LSHK_URL,
  unihan: UNIHAN_URL,
  rimeWords: RIME_WORDS_URL,
  wordshkList: `${WORDSHK_LIST_URL} (SHA-256 ${WORDSHK_LIST_SHA256})`,
  wordshkDump: "local file (CANTO_SRC_WORDSHK_DUMP)",
  kaifangcidian: `${KAIFANGCIDIAN_URL} (SHA-256 ${KAIFANGCIDIAN_SHA256})`,
  wiktionary: `data/wiktionary-dialsyn.json, extracted from ${WIKTIONARY_DIALSYN_URL} (SHA-256 ${WIKTIONARY_DIALSYN_SHA256})`,
  moe: MOEDICT_URL,
  essay: RIME_ESSAY_URL,
};

const AUDIO_ORIGIN = `https://github.com/AlienKevin/wordshk_app/tree/${WORDSHK_AUDIO_COMMIT}/assets/jyutping_female (tree ${WORDSHK_AUDIO_TREE_SHA})`;

const ROW_TABLES = ["readings", "mandarin", "definitions", "examples"] as const;

export interface ReportInput {
  /** Parsed rows per source (validate's sourceRows); an omitted source is absent. */
  readonly sourceRows: Partial<Record<keyof MergeInputs, number>>;
  readonly entries: readonly Entry[];
  readonly stats: MergeStats;
  /** From the audio pack's PackResult: the packed syllables and the pack's size. */
  readonly audio: { readonly syllables: readonly string[]; readonly packBytes: number };
  /** Size of the written canto.db. */
  readonly dbBytes: number;
  /** validate()'s warnings. */
  readonly warnings: readonly string[];
}

interface Count {
  readonly covered: number;
  readonly total: number;
}

export interface AudioCoverage {
  /** Distinct syllables in the readings that have a clip, of all distinct syllables. */
  readonly types: Count;
  /** Syllable occurrences across all readings that have a clip, of all occurrences. */
  readonly tokens: Count;
  /** Syllables with no clip and how often they occur, most frequent first. */
  readonly missing: readonly { readonly syllable: string; readonly count: number }[];
}

/**
 * Audio coverage of the entries' readings (the readings table; example sentences are read by the iOS
 * voice, not clips). Loan syllables (es1 in DSE) are skipped: the app never looks up a clip for them.
 */
export function audioCoverage(entries: readonly Entry[], packed: readonly string[]): AudioCoverage {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const r of entry.readings) {
      r.jyutping.split(" ").forEach((syllable, i) => {
        if (!r.loan?.includes(i)) counts.set(syllable, (counts.get(syllable) ?? 0) + 1);
      });
    }
  }
  const hasClip = new Set(packed);
  const all = [...counts].map(([syllable, count]) => ({ syllable, count }));
  const missing = all.filter((s) => !hasClip.has(s.syllable)).sort((a, b) => b.count - a.count || byCodeUnits(a.syllable, b.syllable));
  const sum = (list: typeof all) => list.reduce((total, s) => total + s.count, 0);
  const tokens = sum(all);
  return {
    types: { covered: all.length - missing.length, total: all.length },
    tokens: { covered: tokens - sum(missing), total: tokens },
    missing,
  };
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const num = (n: number): string => n.toLocaleString("en-US");
const mb = (bytes: number): string => `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
const ratio = ({ covered, total }: Count): string =>
  `${num(covered)} / ${num(total)} (${total === 0 ? "–" : `${((100 * covered) / total).toFixed(2)}%`})`;

/** A cell's content: plain text (escaped) or markup already built from escaped parts. */
type Cell = string | { readonly html: string };
const cell = (c: Cell): string => (typeof c === "string" ? escapeHtml(c) : c.html);
const code = (text: string): Cell => ({ html: `<code>${escapeHtml(text)}</code>` });

/** A two-column table: each row a header cell and a value. */
const keyValues = (rows: readonly (readonly [Cell, Cell])[]): string =>
  `<table>\n${rows.map(([k, v]) => `<tr><th>${cell(k)}</th><td>${cell(v)}</td></tr>`).join("\n")}\n</table>`;

const table = (head: readonly string[], rows: readonly (readonly Cell[])[]): string =>
  `<table>\n<tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>\n` +
  `${rows.map(([first, ...rest]) => `<tr><th>${cell(first)}</th>${rest.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`).join("\n")}\n</table>`;

const list = (items: readonly string[], empty: string): string =>
  items.length === 0 ? `<p>${escapeHtml(empty)}</p>` : `<ul>\n${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("\n")}\n</ul>`;

/** Comma-separated "word (count)" items, or "none". */
const counted = (items: readonly { readonly word: string; readonly count: number }[]): string =>
  items.length === 0 ? "none" : items.map((w) => `${w.word} (${num(w.count)})`).join(", ");

function sourcesSection({ sourceRows, stats }: ReportInput): string {
  const inputs = (Object.keys(SOURCE_ORIGINS) as (keyof MergeInputs)[]).map((name): Cell[] => [
    code(name),
    sourceRows[name] === undefined ? "omitted" : num(sourceRows[name]),
    num(MIN_SOURCE_ROWS[name]),
    SOURCE_ORIGINS[name],
  ]);
  const rowSources = [...new Set(ROW_TABLES.flatMap((t) => Object.keys(stats.rows[t]) as RowSource[]))].sort(byCodeUnits);
  const rows = rowSources.map((source): Cell[] => [source, ...ROW_TABLES.map((t) => num(stats.rows[t][source] ?? 0))]);
  return [
    "<h2>Sources</h2>",
    "<p>Rows each parser kept, the minimum validation requires, and where the source is pinned.</p>",
    table(["Source", "Rows", "Minimum", "Origin"], inputs),
    "<h3>Rows written per source</h3>",
    table(["Source", ...ROW_TABLES], rows),
  ].join("\n");
}

function entriesSection({ entries }: ReportInput): string {
  const of = (kind: Entry["kind"]): Count => {
    const ofKind = entries.filter((e) => e.kind === kind);
    return { covered: ofKind.filter((e) => e.readings.length > 0).length, total: ofKind.length };
  };
  const chars = of("char");
  const words = of("word");
  return [
    "<h2>Entries</h2>",
    keyValues([
      ["Characters", num(chars.total)],
      ["Words", num(words.total)],
      ["Total", num(entries.length)],
    ]),
    "<h3>Reading coverage</h3>",
    "<p>Entries with at least one Jyutping reading.</p>",
    keyValues([
      ["Characters with a reading", ratio(chars)],
      ["Words with a reading", ratio(words)],
    ]),
  ].join("\n");
}

function audioSection({ entries, audio }: ReportInput): string {
  const coverage = audioCoverage(entries, audio.syllables);
  return [
    "<h2>Audio coverage</h2>",
    `<p>Syllables of the entries' readings that have a clip in syllables.pack (loan syllables excluded). Clips: ${escapeHtml(AUDIO_ORIGIN)}.</p>`,
    keyValues([
      ["Clips packed", num(audio.syllables.length)],
      ["Types", ratio(coverage.types)],
      ["Token-weighted", ratio(coverage.tokens)],
    ]),
    `<h3 id="missing">Syllables with no recording (${num(coverage.missing.length)})</h3>`,
    "<p>Each with the number of reading syllables it occurs in, most frequent first.</p>",
    coverage.missing.length === 0
      ? "<p>none</p>"
      : `<p class="syllables">${coverage.missing.map((s) => `${escapeHtml(s.syllable)} (${num(s.count)})`).join(", ")}</p>`,
  ].join("\n");
}

function mergeSection({ stats }: ReportInput): string {
  const { unmatched, keyCollisions, variants, kaifangcidian, wiktionary, moe, simplifiedKeep, freq } = stats;
  return [
    "<h2>Merge</h2>",
    keyValues([
      ["Omitted optional sources", stats.omitted.length === 0 ? "none" : stats.omitted.join(", ")],
      ["Kaifangcidian rows / words with no entry", `${num(unmatched.kaifangcidianRows)} / ${num(unmatched.kaifangcidianWords)}`],
      ["Most frequent unmatched Kaifangcidian words", counted(unmatched.kaifangcidianFrequent)],
      ["Wiktionary forms with no entry", num(unmatched.wiktionaryForms)],
      ["MoE headwords with no entry", num(unmatched.moeEntries)],
      ["Keys spelled several ways", num(keyCollisions.keysWithSeveralSpellings)],
      ["Sample", keyCollisions.sample.map((s) => `${s.key}: ${s.spellings.join(" / ")}`).join("; ") || "none"],
      ["words.hk variant rows / words", `${num(variants.listRows)} / ${num(variants.listWords)}`],
      ["Variant words linked from the dump", num(variants.linkedWords)],
      ["Variant rows / words dropped (no link)", `${num(variants.droppedRows)} / ${num(variants.droppedWords)}`],
      ["Dropped variant words still reached by key", num(variants.droppedButKeyMatched)],
      ["Aliases from variant links", num(variants.aliasesFromLinks)],
      ["Kaifangcidian annotations removed", num(kaifangcidian.annotationsRemoved)],
      ["Kaifangcidian annotation-only items dropped", num(kaifangcidian.emptyItemsDropped)],
      ["Kaifangcidian fragments dropped", num(kaifangcidian.fragmentsDropped)],
      ["Wiktionary forms skipped: usage note", num(wiktionary.notedFormsSkipped)],
      ["Wiktionary pairs skipped: same as Mandarin", num(wiktionary.identityPairsSkipped)],
      ["Wiktionary forms skipped: described character", num(wiktionary.describedFormsSkipped)],
      ["MoE cross-reference senses dropped", num(moe.sensesDropped)],
      ["MoE headwords shadowed by a same-key headword", num(moe.shadowedEntries)],
      ["Simplified text keeps (Cantonese)", simplifiedKeep.cantonese.join(" ") || "none"],
      ["Simplified text keeps (non-BMP)", num(simplifiedKeep.nonBmp.length)],
      ["係 → 系 phrases", counted(simplifiedKeep.xiPhrases)],
      ["Entries with a frequency", num(freq.entriesWithFreq)],
    ]),
    "<h3>Frequency overrides used</h3>",
    list(
      freq.overridesUsed.map((o) => `${o.word}: ${num(o.weight)}${o.essayWeight === undefined ? "" : ` (essay ${num(o.essayWeight)})`}`),
      "none",
    ),
    "<h3>Frequency overrides with no entry</h3>",
    list(freq.overridesUnused, "none"),
  ].join("\n");
}

const STYLE = `body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
table { border-collapse: collapse; margin: 0.5rem 0 1rem; }
th, td { border: 1px solid #ccc; padding: 0.25rem 0.6rem; text-align: left; vertical-align: top; }
td { font-variant-numeric: tabular-nums; }
code, .syllables { font-family: ui-monospace, monospace; font-size: 0.9em; }
.warnings li { color: #a40; }`;

/** The report as a standalone HTML page. Deterministic: the same inputs give the same bytes. */
export function report(input: ReportInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>canto-dict build report</title>
<style>
${STYLE}
</style>
</head>
<body>
<h1>canto-dict build report</h1>
${keyValues([
  ["canto.db", mb(input.dbBytes)],
  ["syllables.pack", mb(input.audio.packBytes)],
])}
<h2>Validation warnings</h2>
<div class="warnings">
${list(input.warnings, "none")}
</div>
${entriesSection(input)}
${audioSection(input)}
${sourcesSection(input)}
${mergeSection(input)}
</body>
</html>
`;
}

/** Writes the report to `path` (a temporary file renamed over it, so a failed write keeps the old one). */
export function writeReport(input: ReportInput, path: string = REPORT_PATH): void {
  const temp = `${path}.tmp`;
  try {
    writeFileSync(temp, report(input));
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}
