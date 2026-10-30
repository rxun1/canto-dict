import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRimeWords } from "../../src/sources/rimeWords";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/rime-words.dict.yaml"), "utf8");
const HEADER = '---\nname: jyut6ping3.words\nversion: "2026.08.10"\nsort: by_weight\n...\n';

describe("parseRimeWords", () => {
  it("keeps 34 of the 39 fixture rows and skips 5", () => {
    const { readings, skipped } = parseRimeWords(fixture);
    expect(readings).toHaveLength(34);
    expect(skipped).toHaveLength(5);
  });

  it("never parses header or comment lines as data", () => {
    const { readings, skipped } = parseRimeWords(fixture);
    expect(readings[0]).toEqual({ word: "吖笨", jyutping: ["aa1", "ban6"] });
    expect(readings.some((r) => r.word.startsWith("name") || r.word.startsWith("#"))).toBe(false);
    expect(skipped.every((p) => p.line > 13)).toBe(true);
  });

  it("splits multi-syllable readings into one Jyutping per character", () => {
    const { readings } = parseRimeWords(fixture);
    expect(readings.find((r) => r.word === "後生仔")).toEqual({
      word: "後生仔",
      jyutping: ["hau6", "saang1", "zai2"],
    });
    for (const r of readings) expect(r.jyutping).toHaveLength([...r.word].length);
  });

  it("keeps the changed-tone reading of 姐姐 alongside the base one, in file order", () => {
    const { readings } = parseRimeWords(fixture);
    expect(readings.filter((r) => r.word === "姐姐").map((r) => r.jyutping)).toEqual([
      ["ze2", "ze2"],
      ["ze4", "ze1"],
    ]);
    expect(readings.filter((r) => r.word === "哥哥").map((r) => r.jyutping)).toEqual([
      ["go1", "go1"],
      ["go4", "go1"],
    ]);
  });

  it("reports rows whose syllable count differs from the character count", () => {
    const { readings, skipped } = parseRimeWords(fixture);
    expect(readings.some((r) => r.word === "年卅晚")).toBe(false);
    const p = skipped.find((s) => /年卅晚/.test(s.message));
    expect(p?.line).toBe(46);
    expect(p?.message).toMatch(/3 characters but 4 syllables/);
  });

  it("skips punctuation-bearing proverbs because their syllable count differs", () => {
    const { skipped } = parseRimeWords(fixture);
    expect(skipped.filter((s) => /，/.test(s.message)).map((s) => s.line)).toEqual([50, 51, 52]);
  });

  it("keeps rows with colloquial syllables that are attested via this dict (kaan2, gwek4, zeu6)", () => {
    const { readings } = parseRimeWords(fixture);
    expect(readings.find((r) => r.word === "暗坎")?.jyutping).toEqual(["am3", "kaan2"]);
    expect(readings.find((r) => r.word === "呱呱")?.jyutping).toEqual(["gwek4", "gwek4"]);
    expect(readings.find((r) => r.word === "噍低")?.jyutping).toEqual(["zeu6", "dai1"]);
  });

  it("skips a row with a pattern-valid but unattested syllable, with the right line number", () => {
    const { readings, skipped } = parseRimeWords(`${HEADER}甲乙\tgaap3 jyut6\n丙丁\tzzz1 ding1\n`);
    expect(readings).toEqual([{ word: "甲乙", jyutping: ["gaap3", "jyut6"] }]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(7);
    expect(skipped[0].message).toMatch(/invalid syllable "zzz1"/);
  });

  it("treats an uppercase syllable as a row-level problem", () => {
    const { readings, skipped } = parseRimeWords(`${HEADER}甲乙\tGaap3 jyut6\n`);
    expect(readings).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(6);
    expect(skipped[0].message).toMatch(/Gaap3/);
  });

  it("skips blank and comment lines after the header", () => {
    const { readings } = parseRimeWords(`${HEADER}\n# note\n甲乙\tgaap3 jyut6\n`);
    expect(readings).toEqual([{ word: "甲乙", jyutping: ["gaap3", "jyut6"] }]);
  });

  it("accepts CRLF line endings", () => {
    const { readings } = parseRimeWords(`${HEADER}甲乙\tgaap3 jyut6\n`.replace(/\n/g, "\r\n"));
    expect(readings).toEqual([{ word: "甲乙", jyutping: ["gaap3", "jyut6"] }]);
  });

  it("throws when the YAML end marker is missing", () => {
    expect(() => parseRimeWords("---\nname: x\n甲乙\tgaap3 jyut6\n")).toThrow(/end marker/);
  });

  it("throws once, listing every structural problem with its line number", () => {
    const text = `${HEADER}甲乙\n丙丁\tgaap3 jyut6\t5x\n`;
    expect(() => parseRimeWords(text)).toThrow(/rime words has 2 problem\(s\)/);
    expect(() => parseRimeWords(text)).toThrow(/line 6:/);
    expect(() => parseRimeWords(text)).toThrow(/line 7:/);
  });
});
