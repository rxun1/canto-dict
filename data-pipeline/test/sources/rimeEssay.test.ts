import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRimeEssay } from "../../src/sources/rimeEssay";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/rime-essay-cantonese.txt"), "utf8");

const weightOf = (text: string, word: string): number | undefined =>
  parseRimeEssay(text).rows.find((r) => r.word === word)?.weight;

describe("parseRimeEssay", () => {
  it("keeps 32 of the 38 fixture rows and skips 6", () => {
    const { rows, skipped } = parseRimeEssay(fixture);
    expect(rows).toHaveLength(32);
    expect(skipped).toHaveLength(6);
  });

  it("returns word/weight rows in file order, starting at line 1 (the file has no header)", () => {
    const { rows } = parseRimeEssay(fixture);
    expect(rows.slice(0, 3)).toEqual([
      { word: "〇", weight: 981 },
      { word: "〇〇", weight: 658 },
      { word: "㐀", weight: 0 },
    ]);
  });

  it("gives common Cantonese words their weights, above Mandarin-only words", () => {
    expect(weightOf(fixture, "我")).toBe(12831921);
    expect(weightOf(fixture, "嘅")).toBe(4333042);
    expect(weightOf(fixture, "唔該")).toBe(110343);
    expect(weightOf(fixture, "嘅")).toBeGreaterThan(weightOf(fixture, "的")!);
  });

  it("keeps the source's spelling: 我地 is present, 我哋 is not", () => {
    expect(weightOf(fixture, "我地")).toBe(55260);
    expect(weightOf(fixture, "我哋")).toBeUndefined();
  });

  it("keeps zero weights (rare characters) as 0", () => {
    expect(weightOf(fixture, "㐀")).toBe(0);
    expect(weightOf(fixture, "㐁")).toBe(1);
  });

  it("lets a repeated word's last row win, skipping the earlier row with its line number", () => {
    const { rows, skipped } = parseRimeEssay(fixture);
    expect(rows.filter((r) => r.word === "革")).toEqual([{ word: "革", weight: 800 }]);
    expect(rows.filter((r) => r.word === "張敬軒")).toEqual([{ word: "張敬軒", weight: 711 }]);
    expect(skipped.find((s) => s.line === 22)?.message).toMatch(/革.*superseded by line 38/);
    expect(skipped.find((s) => s.line === 16)?.message).toMatch(/張敬軒.*superseded by line 31/);
    expect(new Set(rows.map((r) => r.word)).size).toBe(rows.length);
  });

  it("places a repeated word at its last row's position", () => {
    const words = parseRimeEssay(fixture).rows.map((r) => r.word);
    expect(words.indexOf("張敬軒")).toBeGreaterThan(words.indexOf("T恤"));
    expect(words.at(-1)).toBe("革");
  });

  it("skips punctuation, symbol and digit-only rows, with line numbers", () => {
    const { rows, skipped } = parseRimeEssay(fixture);
    for (const word of ["、", "1", "5", "○"]) expect(rows.some((r) => r.word === word)).toBe(false);
    const nonWord = skipped.filter((s) => /punctuation, symbol, space or other non-word character/.test(s.message));
    expect(nonWord.map((s) => s.line)).toEqual([24, 33]); // 、 ○
    const noHan = skipped.filter((s) => /no Han character/.test(s.message));
    expect(noHan.map((s) => s.line)).toEqual([29, 32]); // 1 5
  });

  it("skips a word with an ideographic variation selector (no real row has a combining mark)", () => {
    const { rows, skipped } = parseRimeEssay("甲\u{E0100}\t5\n乙\t6\n");
    expect(rows).toEqual([{ word: "乙", weight: 6 }]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(1);
    expect(skipped[0].message).toMatch(/other non-word character/);
  });

  it("names the next occurrence's line when a word appears three times", () => {
    const { rows, skipped } = parseRimeEssay("甲\t1\n乙\t9\n甲\t2\n甲\t3\n");
    expect(rows).toEqual([
      { word: "乙", weight: 9 },
      { word: "甲", weight: 3 },
    ]);
    expect(skipped.map((s) => [s.line, s.message])).toEqual([
      [1, expect.stringMatching(/甲 1 superseded by line 3 \(2\)/)],
      [3, expect.stringMatching(/甲 2 superseded by line 4 \(3\)/)],
    ]);
  });

  it("counts blank lines when numbering skipped rows", () => {
    const { skipped } = parseRimeEssay("甲\t1\n\n\n、\t2\n");
    expect(skipped.map((s) => s.line)).toEqual([4]);
  });

  it("keeps mixed Latin+Han words and supplementary-plane characters", () => {
    expect(weightOf(fixture, "T恤")).toBe(1245);
    expect(weightOf(fixture, "𥄫")).toBe(20000);
  });

  it("skips a Han word containing punctuation or a space", () => {
    const { rows, skipped } = parseRimeEssay("一，二\t5\n三 四\t6\n五\t7\n");
    expect(rows).toEqual([{ word: "五", weight: 7 }]);
    expect(skipped.map((s) => s.line)).toEqual([1, 2]);
  });

  it("skips a negative weight as a row-level problem, and that row supersedes nothing", () => {
    const { rows, skipped } = parseRimeEssay("甲\t3\n乙\t4\n甲\t-2\n");
    expect(rows).toEqual([
      { word: "甲", weight: 3 },
      { word: "乙", weight: 4 },
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(3);
    expect(skipped[0].message).toMatch(/negative weight -2 for 甲/);
  });

  it("treats a minus-signed zero as a negative weight", () => {
    const { rows, skipped } = parseRimeEssay("甲\t-0\n乙\t0\n");
    expect(rows).toEqual([{ word: "乙", weight: 0 }]);
    expect(Object.is(rows[0].weight, 0)).toBe(true);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].message).toMatch(/negative weight -0 for 甲/);
  });

  it("accepts the largest safe integer and throws on a weight beyond 2^53 - 1", () => {
    expect(parseRimeEssay(`甲\t${Number.MAX_SAFE_INTEGER}\n`).rows).toEqual([
      { word: "甲", weight: Number.MAX_SAFE_INTEGER },
    ]);
    expect(() => parseRimeEssay("甲\t9007199254740993\n")).toThrow(/line 1: weight is not a safe integer for 甲/);
    expect(() => parseRimeEssay("甲\t-9007199254740993\n")).toThrow(/line 1: weight is not a safe integer for 甲/);
  });

  it("accepts CRLF line endings and a BOM, and ignores blank lines", () => {
    const { rows } = parseRimeEssay("\uFEFF甲\t3\r\n\r\n乙\t4\r\n");
    expect(rows).toEqual([
      { word: "甲", weight: 3 },
      { word: "乙", weight: 4 },
    ]);
  });

  it("throws once, listing every structural problem with its line number", () => {
    const text = "甲\t3\n乙\n丙\t4\textra\n\t5\n丁\t1.5\n戊\tabc\n己\t\n";
    expect(() => parseRimeEssay(text)).toThrow(/rime essay has 6 problem\(s\)/);
    expect(() => parseRimeEssay(text)).toThrow(/line 2: no tab-separated weight/);
    expect(() => parseRimeEssay(text)).toThrow(/line 3: unexpected extra column/);
    expect(() => parseRimeEssay(text)).toThrow(/line 4: empty word/);
    expect(() => parseRimeEssay(text)).toThrow(/line 5: weight is not an integer/);
    expect(() => parseRimeEssay(text)).toThrow(/line 6: weight is not an integer/);
    expect(() => parseRimeEssay(text)).toThrow(/line 7: weight is not an integer/);
  });

  it("throws on a file with no data rows (e.g. an empty download)", () => {
    expect(() => parseRimeEssay("\n")).toThrow(/rime essay has 1 problem\(s\)[\s\S]*no data rows/);
  });

  it("throws on a Rime .dict.yaml given by mistake", () => {
    expect(() => parseRimeEssay('---\nname: jyut6ping3.words\n...\n甲乙\tgaap3 jyut6\n')).toThrow(/rime essay has/);
  });
});
