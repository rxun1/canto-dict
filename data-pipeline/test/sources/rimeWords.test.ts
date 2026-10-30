import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRimeWords } from "../../src/sources/rimeWords";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/rime-words.dict.yaml"), "utf8");
const HEADER = '---\nname: jyut6ping3.words\nversion: "2026.08.10"\nsort: by_weight\n...\n';

describe("parseRimeWords", () => {
  it("keeps 35 of the 40 fixture rows and skips 5", () => {
    const { rows, skipped } = parseRimeWords(fixture);
    expect(rows).toHaveLength(35);
    expect(skipped).toHaveLength(5);
  });

  it("never parses header or comment lines as data", () => {
    const { rows } = parseRimeWords(fixture);
    expect(rows[0]).toEqual({ word: "吖笨", syllables: ["aa1", "ban6"] });
    expect(rows.some((r) => r.word.startsWith("name") || r.word.startsWith("#"))).toBe(false);
  });

  it("splits multi-syllable readings into one Jyutping per character", () => {
    const { rows } = parseRimeWords(fixture);
    expect(rows.find((r) => r.word === "後生仔")).toEqual({
      word: "後生仔",
      syllables: ["hau6", "saang1", "zai2"],
    });
    for (const r of rows) expect(r.syllables).toHaveLength([...r.word].length);
  });

  it("keeps the changed-tone reading of 姐姐 alongside the base one, in file order", () => {
    const { rows } = parseRimeWords(fixture);
    expect(rows.filter((r) => r.word === "姐姐").map((r) => r.syllables)).toEqual([
      ["ze2", "ze2"],
      ["ze4", "ze1"],
    ]);
    expect(rows.filter((r) => r.word === "哥哥").map((r) => r.syllables)).toEqual([
      ["go1", "go1"],
      ["go4", "go1"],
    ]);
  });

  it("reports rows whose syllable count differs from the character count", () => {
    const { rows, skipped } = parseRimeWords(fixture);
    expect(rows.some((r) => r.word === "年卅晚")).toBe(false);
    const p = skipped.find((s) => /年卅晚/.test(s.message));
    expect(p?.line).toBe(47);
    expect(p?.message).toMatch(/3 characters but 4 syllables/);
  });

  it("skips punctuation-bearing proverbs because their syllable count differs", () => {
    const { skipped } = parseRimeWords(fixture);
    expect(skipped.filter((s) => /，/.test(s.message)).map((s) => s.line)).toEqual([51, 52, 53]);
  });

  it("keeps rows with colloquial syllables that are attested via this dict (kaan2, gwek4, zeu6)", () => {
    const { rows } = parseRimeWords(fixture);
    expect(rows.find((r) => r.word === "暗坎")?.syllables).toEqual(["am3", "kaan2"]);
    expect(rows.find((r) => r.word === "呱呱")?.syllables).toEqual(["gwek4", "gwek4"]);
    expect(rows.find((r) => r.word === "噍低")?.syllables).toEqual(["zeu6", "dai1"]);
  });

  it("keeps words with supplementary-plane (Ext B+) characters, counting code points not UTF-16 units", () => {
    const { rows } = parseRimeWords(fixture);
    expect(rows.find((r) => r.word === "挨𩩍")).toEqual({ word: "挨𩩍", syllables: ["aai1", "peng1"] });
  });

  it("treats an empty word as a structural problem, not a count mismatch", () => {
    expect(() => parseRimeWords(`${HEADER}\tgaap3\n`)).toThrow(/line 6:.*empty word/);
  });

  it("skips a row with a pattern-valid but unattested syllable, with the right line number", () => {
    const { rows, skipped } = parseRimeWords(`${HEADER}甲乙\tgaap3 jyut6\n丙丁\tzzz1 ding1\n`);
    expect(rows).toEqual([{ word: "甲乙", syllables: ["gaap3", "jyut6"] }]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(7);
    expect(skipped[0].message).toMatch(/invalid syllable "zzz1"/);
  });

  it("treats an uppercase syllable as a row-level problem", () => {
    const { rows, skipped } = parseRimeWords(`${HEADER}甲乙\tGaap3 jyut6\n`);
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(6);
    expect(skipped[0].message).toMatch(/Gaap3/);
  });

  it("skips blank and comment lines after the header", () => {
    const { rows } = parseRimeWords(`${HEADER}\n# note\n甲乙\tgaap3 jyut6\n`);
    expect(rows).toEqual([{ word: "甲乙", syllables: ["gaap3", "jyut6"] }]);
  });

  it("accepts CRLF line endings", () => {
    const { rows } = parseRimeWords(`${HEADER}甲乙\tgaap3 jyut6\n`.replace(/\n/g, "\r\n"));
    expect(rows).toEqual([{ word: "甲乙", syllables: ["gaap3", "jyut6"] }]);
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
