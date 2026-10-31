// Build validation (Jyutping of every merged reading, source row counts) and the HTML build report (spec §4.6).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { report, writeReport, type ReportInput } from "../src/build/report";
import { merge } from "../src/merge/merge";
import type { Entry } from "../src/merge/types";
import { MIN_SOURCE_ROWS, NO_MINIMUMS, sourceRows, validate } from "../src/validate";
import { inputs } from "./mergeInputs";

const entry = (key: string, readings: Entry["readings"], examples: Entry["examples"] = []): Entry => ({
  key,
  trad: key,
  simp: key,
  kind: [...key].length === 1 ? "char" : "word",
  freq: 0,
  aliases: [],
  readings,
  mandarin: [],
  definitions: [],
  examples,
});

const SIK = entry("食", [{ jyutping: "sik6", rank: "default", source: "rime" }]);
/** words.hk writes DSE's loan syllable as !es1 (merge stores it as es1 with loan [1]). */
const DSE = entry("DSE", [{ jyutping: "di1 es1 ji1", source: "wordshk-list", loan: [1] }]);
/** 喇 la1 and 咩 me1 are sentence particles (PARTICLES), valid though outside the syllable table. */
const LA = entry("喇", [{ jyutping: "la1", source: "rime" }]);
const ME = entry("咩", [{ jyutping: "me1", source: "rime" }]);

describe("validate", () => {
  it("accepts valid Jyutping, sentence particles and loan syllables", () => {
    expect(() => validate({ sources: inputs(), entries: [SIK, DSE, LA, ME], audioClips: 0 }, NO_MINIMUMS)).not.toThrow();
  });

  it("throws on an invalid reading, naming the entry and the syllable", () => {
    const bad = entry("食飯", [{ jyutping: "sik6 faan9", source: "rime" }]);
    expect(() => validate({ sources: inputs(), entries: [SIK, bad], audioClips: 0 }, NO_MINIMUMS)).toThrow(/entry 2: 食飯 .*"faan9"/);
  });

  it("throws on a non-loan syllable that is not Jyutping, even when another syllable is a loan", () => {
    const bad = entry("DSE", [{ jyutping: "di1 es1 es1", source: "wordshk-list", loan: [1] }]);
    expect(() => validate({ sources: inputs(), entries: [bad], audioClips: 0 }, NO_MINIMUMS)).toThrow(/"es1"/);
  });

  it("throws on an invalid example sentence reading", () => {
    const bad = entry("食", SIK.readings, [
      { sense: 1, yueTrad: "食飯", yueSimp: "食饭", jyutping: "sik6 fan", source: "wordshk-dump" },
    ]);
    expect(() => validate({ sources: inputs(), entries: [bad], audioClips: 0 }, NO_MINIMUMS)).toThrow(/example .*"fan"/);
  });

  it("throws on an empty reading", () => {
    const bad = entry("食", [{ jyutping: "", source: "rime" }]);
    expect(() => validate({ sources: inputs(), entries: [bad], audioClips: 0 }, NO_MINIMUMS)).toThrow(/entry 1: 食/);
  });

  it("throws when a source has fewer rows than its minimum, e.g. rime chars < 25,000", () => {
    expect(MIN_SOURCE_ROWS.rimeChars).toBe(25_000);
    const sources = inputs({ rimeChars: [{ char: "食", jyutping: "sik6", rank: "default" }] });
    expect(() => validate({ sources, entries: [], audioClips: 0 }, { ...NO_MINIMUMS, rimeChars: 2 })).toThrow(
      /rimeChars: 1 rows? \(minimum 2\)/,
    );
    expect(() => validate({ sources, entries: [], audioClips: 0 }, { ...NO_MINIMUMS, rimeChars: 1 })).not.toThrow();
  });

  it("checks the real minimums by default", () => {
    expect(() => validate({ sources: inputs(), entries: [], audioClips: 0 })).toThrow(/rimeChars: 0 rows \(minimum 25,000\)/);
  });

  it("throws when there are fewer audio clips than the minimum", () => {
    expect(() => validate({ sources: inputs(), entries: [], audioClips: 2 }, { ...NO_MINIMUMS, audioClips: 3 })).toThrow(
      /audioClips: 2 rows? \(minimum 3\)/,
    );
  });

  it("skips the optional words.hk dump when it is omitted, and warns about it", () => {
    const sources = inputs({ wordshkDump: undefined });
    expect(validate({ sources, entries: [], audioClips: 0 }, { ...NO_MINIMUMS, wordshkDump: 10 })).toEqual([
      expect.stringMatching(/words\.hk dump .*omitted/),
    ]);
    expect(validate({ sources: inputs(), entries: [], audioClips: 0 }, NO_MINIMUMS)).toEqual([]);
  });

  it("does not write anything: it only reads its arguments", () => {
    // A pure check: P1-T17's cli calls it before writing canto.db, the audio pack or the report.
    const sources = inputs();
    const before = JSON.stringify(sources);
    validate({ sources, entries: [SIK], audioClips: 0 }, NO_MINIMUMS);
    expect(JSON.stringify(sources)).toBe(before);
  });
});

describe("report", () => {
  const sources = inputs({
    rimeChars: [
      { char: "食", jyutping: "sik6", rank: "default" },
      { char: "喇", jyutping: "la1", rank: "default" },
    ],
    rimeWords: [{ word: "食飯", syllables: ["sik6", "faan6"] }],
    wordshkList: [{ word: "DSE", syllables: ["di1", "es1", "ji1"], loanSyllables: [1] }],
  });
  const { entries, stats } = merge(sources);
  const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
    sourceRows: sourceRows(sources),
    entries,
    stats,
    // faan6, ji1 and la1 have no clip; es1 is a loan syllable and is never looked up.
    audio: { syllables: ["di1", "sik6"], packBytes: 9_677_774 },
    dbBytes: 63_100_000,
    warnings: ["words.hk dump <omitted>"],
    ...overrides,
  });

  it("lists entry counts per kind and rows per source", () => {
    const html = report(input());
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("Characters</th><td>2</td>");
    expect(html).toContain("Words</th><td>2</td>");
    expect(html).toMatch(/rimeChars<\/code><\/th><td>2<\/td>/);
    expect(html).toMatch(/wordshkList<\/code><\/th><td>1<\/td>/);
  });

  it("gives audio coverage by type and token-weighted, skipping loan syllables", () => {
    const html = report(input());
    // Readings: sik6 (食), la1 (喇), sik6 faan6 (食飯), di1 [es1] ji1 (DSE): 5 types, 6 tokens; di1, sik6 have clips.
    expect(html).toContain("Types</th><td>2 / 5 (40.00%)</td>");
    expect(html).toContain("Token-weighted</th><td>3 / 6 (50.00%)</td>");
    expect(html).not.toContain("es1");
  });

  it("lists the syllables with no recording, most frequent first", () => {
    const html = report(input());
    const missing = html.slice(html.indexOf('id="missing"'));
    expect(missing).toMatch(/faan6.*ji1.*la1/s);
    expect(missing).not.toMatch(/sik6|di1/);
  });

  it("gives the DB and audio pack sizes in MB", () => {
    const html = report(input());
    expect(html).toContain("63.10 MB");
    expect(html).toContain("9.68 MB");
  });

  it("names the pinned audio source", () => {
    expect(report(input())).toMatch(/wordshk_app\/tree\/[0-9a-f]{40}/);
  });

  it("escapes interpolated text", () => {
    const html = report(input());
    expect(html).toContain("words.hk dump &lt;omitted&gt;");
    expect(html).not.toContain("<omitted>");
  });

  it("writes the report to a file", () => {
    const path = join(mkdtempSync(join(tmpdir(), "canto-report-")), "build-report.html");
    writeReport(input(), path);
    expect(readFileSync(path, "utf8")).toBe(report(input()));
  });
});
