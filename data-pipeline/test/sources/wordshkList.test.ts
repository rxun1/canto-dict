import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { parseWordshkList } from "../../src/sources/wordshkList";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/wordshk-list.csv"), "utf8");
const HEADER = "Source,https://words.hk/faiman/analysis/wordslist/\r\n";

describe("parseWordshkList", () => {
  it("keeps 36 of the 64 fixture readings and skips 28", () => {
    const { rows, skipped } = parseWordshkList(fixture);
    expect(rows).toHaveLength(36);
    expect(skipped).toHaveLength(28);
  });

  it("never parses the Source line as data", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows[0]).toEqual({ word: "0", syllables: ["ling4"] });
    expect(rows.some((r) => r.word === "Source")).toBe(false);
  });

  it("returns a plain WordReading with one syllable per character", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows.find((r) => r.word === "後生仔")).toEqual({ word: "後生仔", syllables: ["hau6", "saang1", "zai2"] });
    for (const r of rows) expect(r.syllables).toHaveLength([...r.word].length);
  });

  it("emits one WordReading per reading, in file order", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows.filter((r) => r.word === "行").map((r) => r.syllables)).toEqual([
      ["haang4"],
      ["hong2"],
      ["hong4"],
      ["hang4"],
      ["hang6"],
    ]);
    expect(rows.filter((r) => r.word === "姐姐").map((r) => r.syllables)).toEqual([
      ["ze4", "ze1"],
      ["ze1", "ze1"],
    ]);
  });

  it("keeps a loan syllable without its '!' and records its index", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows.find((r) => r.word === "FBI")).toEqual({
      word: "FBI",
      syllables: ["ef1", "bi1", "aai1"],
      loanSyllables: [0],
    });
    expect(rows.filter((r) => r.word === "DSE")).toEqual([
      { word: "DSE", syllables: ["di1", "es1", "ji1"], loanSyllables: [1] },
      { word: "DSE", syllables: ["di1", "e1", "si1"] },
    ]);
    expect(rows.find((r) => r.word === "DJ")).toEqual({ word: "DJ", syllables: ["di1", "zhei1"], loanSyllables: [1] });
  });

  it("does not skip a loan syllable that is invalid Jyutping (es1)", () => {
    expect(isValidSyllable("es1")).toBe(false);
    const { rows, skipped } = parseWordshkList(`${HEADER}DSE,di1 !es1 ji1\r\n`);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([{ word: "DSE", syllables: ["di1", "es1", "ji1"], loanSyllables: [1] }]);
  });

  it("omits loanSyllables entirely on rows without loan syllables", () => {
    const { rows } = parseWordshkList(fixture);
    for (const r of rows.filter((x) => x.word === "你好" || x.word === "0")) expect("loanSyllables" in r).toBe(false);
  });

  it("flags every loan syllable index when there are several", () => {
    const { rows } = parseWordshkList(`${HEADER}甲乙丙,!ef1 gaap3 !es1\r\n`);
    expect(rows).toEqual([{ word: "甲乙丙", syllables: ["ef1", "gaap3", "es1"], loanSyllables: [0, 2] }]);
  });

  it("skips a malformed loan syllable (bare '!', no tone, glued syllables) with its line number", () => {
    const { rows, skipped } = parseWordshkList(fixture);
    expect(rows.some((r) => ["H", "UST", "brunch"].includes(r.word))).toBe(false);
    const byLine = (n: number) => skipped.filter((s) => s.line === n).map((s) => s.message);
    expect(byLine(16)[0]).toMatch(/malformed loan syllable "!" for H/);
    expect(byLine(20)).toHaveLength(1);
    expect(byLine(20)[0]).toMatch(/malformed loan syllable "!ju1es1ti1" for UST/);
    expect(byLine(21)).toHaveLength(2);
    expect(byLine(21)[0]).toMatch(/malformed loan syllable "!cyu"/);
  });

  it("skips readings whose syllable count differs from the code-point count", () => {
    const { rows, skipped } = parseWordshkList(fixture);
    expect(rows.some((r) => r.word === "56k")).toBe(false);
    const p = skipped.filter((s) => s.line === 5);
    expect(p).toHaveLength(2);
    expect(p[0].message).toMatch(/56k has 3 characters but 4 syllables/);
  });

  it("skips a non-loan syllable that fails isValidSyllable", () => {
    expect(isValidSyllable("pi1")).toBe(false);
    const { rows, skipped } = parseWordshkList(fixture);
    expect(rows.some((r) => r.word === "P")).toBe(false);
    expect(skipped.find((s) => s.line === 18)?.message).toMatch(/invalid syllable "pi1" for P/);
  });

  it("strips the trailing '*' variant marker from the word", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows.find((r) => r.word === "㨂")).toEqual({ word: "㨂", syllables: ["gaan2"] });
    expect(rows.some((r) => r.word.includes("*"))).toBe(false);
  });

  it("keeps supplementary-plane words, counting code points not UTF-16 units", () => {
    const { rows } = parseWordshkList(fixture);
    expect(rows.find((r) => r.word === "𭉝𭉝")).toEqual({ word: "𭉝𭉝", syllables: ["syu4", "syu2"] });
  });

  it("accepts LF line endings and ignores blank lines", () => {
    const { rows } = parseWordshkList(`${HEADER.replace("\r", "")}\n甲乙,gaap3 jyut6\n\n`);
    expect(rows).toEqual([{ word: "甲乙", syllables: ["gaap3", "jyut6"] }]);
  });

  it("throws when the first line is not the Source line", () => {
    expect(() => parseWordshkList("word,reading\r\n甲乙,gaap3 jyut6\r\n")).toThrow(/line 1:.*Source/);
  });

  it("throws on a row with no readings, with its line number", () => {
    expect(() => parseWordshkList(`${HEADER}甲乙\r\n`)).toThrow(/line 2:.*no reading/);
  });

  it("throws on an empty word or an empty reading", () => {
    expect(() => parseWordshkList(`${HEADER},gaap3\r\n`)).toThrow(/line 2:.*empty word/);
    expect(() => parseWordshkList(`${HEADER}甲乙,gaap3 jyut6,\r\n`)).toThrow(/line 2:.*empty reading/);
  });

  it("throws once, listing every structural problem", () => {
    const text = `${HEADER}甲乙\r\n丙丁,gaap3 jyut6\r\n,x1\r\n`;
    expect(() => parseWordshkList(text)).toThrow(/words\.hk word list has 2 problem\(s\)/);
    expect(() => parseWordshkList(text)).toThrow(/line 2:/);
    expect(() => parseWordshkList(text)).toThrow(/line 4:/);
  });
});
