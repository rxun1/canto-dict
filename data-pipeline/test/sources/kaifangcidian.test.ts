import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { parseKaifangcidian, readKaifangcidianZip } from "../../src/sources/kaifangcidian";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/kfcd-cidian.txt"), "utf8");
const HEADER =
  "开放粤语词典（耶鲁拼音数字调号版）\n\n© 2013年 kaifangcidian.com\n\n\n\n\n［粤语词汇］\t［耶鲁拼音］\t［国语解释］\n\n";

describe("parseKaifangcidian", () => {
  it("keeps 34 of the 40 fixture rows, skips 6, and ignores the whitespace-only last line", () => {
    const { rows, skipped } = parseKaifangcidian(fixture);
    expect(rows).toHaveLength(34);
    expect(skipped).toHaveLength(6);
    expect(skipped.map((s) => s.line)).toEqual([16, 17, 18, 20, 21, 25]);
  });

  it("keeps 27 rows with at least one Mandarin equivalent and 7 without", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.filter((r) => r.mandarin.length > 0)).toHaveLength(27);
    expect(rows.filter((r) => r.mandarin.length === 0)).toHaveLength(7);
  });

  it("maps 冇 to 没有, 没, 无 with its Jyutping", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "冇")).toEqual({
      word: "冇",
      syllables: ["mou5"],
      mandarin: ["没有", "没", "无"],
    });
  });

  it("keeps both readings of 嘅, each with its own Mandarin equivalents", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.filter((r) => r.word === "嘅")).toEqual([
      { word: "嘅", syllables: ["ge2"], mandarin: ["呢", "吗"] },
      { word: "嘅", syllables: ["ge3"], mandarin: ["的"] },
    ]);
  });

  it("gives an empty mandarin list to a row with no equivalent", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "吖啶")).toEqual({
      word: "吖啶",
      syllables: ["aa1", "ding6"],
      mandarin: [],
    });
  });

  it("converts checked tones and eu / yu finals in a multi-syllable word", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "鸦雀无声")?.syllables).toEqual(["aa1", "zoek3", "mou4", "sing1"]);
    expect(rows.find((r) => r.word === "穿靴戴帽")?.syllables).toEqual(["cyun1", "hoe1", "daai3", "mou6"]);
    expect(rows.find((r) => r.word === "月圆花好")?.syllables).toEqual(["jyut6", "jyun4", "faa1", "hou2"]);
  });

  it("splits Mandarin on the full-width comma and also on 、 and ；", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "冇把炮")?.mandarin).toEqual(["没有把握", "没有依靠", "没本事"]);
    expect(rows.find((r) => r.word === "街数")?.mandarin).toEqual(["债务", "外账", "外债"]);
    expect(rows.find((r) => r.word === "波棍")?.mandarin).toEqual(["换档杆", "变速杆"]);
    expect(rows.find((r) => r.word === "鸭仔")?.mandarin).toEqual(["小鸭", "小鸭子"]);
  });

  it("de-duplicates Mandarin equivalents, keeping first-seen order", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "茭笋")?.mandarin).toEqual(["茭白", "茭白笋"]);
    expect(rows.find((r) => r.word === "穿窿")?.mandarin).toEqual([
      "穿洞", "穿孔", "穿洞的", "穿孔的", "洞穿的", "出现破洞", "穿了个洞", "破了个洞", "穿了个窟窿",
    ]);
  });

  it("keeps annotations and ellipses inside an equivalent as written", () => {
    const { rows } = parseKaifangcidian(fixture);
    expect(rows.find((r) => r.word === "行埋")?.mandarin).toEqual(["（婉）性交", "同房"]);
    expect(rows.find((r) => r.word === "咋")?.mandarin).toEqual(["…而已呀"]);
  });

  it("skips a row whose converted syllable is not valid Jyutping, naming its line", () => {
    const { rows, skipped } = parseKaifangcidian(fixture);
    expect(rows.some((r) => r.word === "IP" || r.word === "M")).toBe(false);
    expect(skipped.find((s) => s.line === 17)?.message).toMatch(/invalid syllable "pi1".*IP/);
    expect(skipped.find((s) => s.line === 25)?.message).toMatch(/invalid syllable "em1".*M/);
  });

  it("skips a row whose syllable count differs from its character count, naming its line", () => {
    const { rows, skipped } = parseKaifangcidian(fixture);
    expect(rows.some((r) => r.word === "亚sir" || r.word === "…亲")).toBe(false);
    expect(skipped.find((s) => s.line === 16)?.message).toMatch(/亚sir has 4 characters but 2 syllables/);
    expect(skipped.find((s) => s.line === 20)?.message).toMatch(/…亲 has 2 characters but 1 syllables/);
  });

  it("skips a row whose romanization has an unknown Yale syllable, naming its line", () => {
    const { rows, skipped } = parseKaifangcidian(`${HEADER}冇\tmou5\t没有\n冇\txyz5\t没有\n`);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.line).toBe(11);
    expect(skipped[0]?.message).toMatch(/cannot convert Yale syllable "xyz5"/);
  });

  it("accepts CRLF line endings", () => {
    const { rows } = parseKaifangcidian(`${HEADER}冇\tmou5\t没有，没，无\r\n`.replace(/\n/g, "\r\n"));
    expect(rows).toEqual([{ word: "冇", syllables: ["mou5"], mandarin: ["没有", "没", "无"] }]);
  });

  it("throws when the column header line is missing (wrong or changed file)", () => {
    expect(() => parseKaifangcidian("冇\tmou5\t没有\n")).toThrow(/column header/);
    const traditional = HEADER.replace("［粤语词汇］", "［粵語詞彙］");
    expect(() => parseKaifangcidian(`${traditional}冇\tmou5\t没有\n`)).toThrow(/column header/);
  });

  it("throws, listing every offending line, for a row without exactly three columns", () => {
    const text = `${HEADER}冇\tmou5\n冇\tmou5\t没有\textra\n\tmou5\t没有\n冇\t\t没有\n`;
    expect(() => parseKaifangcidian(text)).toThrow(/line 10:.*line 11:.*line 12:.*line 13:/s);
  });
});

describe("readKaifangcidianZip", () => {
  const ENTRY = "cidian_zhyue-jt-kfcd-ylshu-2021714.txt";
  const encode = (s: string) => new TextEncoder().encode(s);

  it("returns the text of the pinned entry, ignoring the other entries", () => {
    const zip = zipSync({ [ENTRY]: encode("冇\tmou5\t没有\n"), "other.txt": encode("not this one") });
    expect(readKaifangcidianZip(zip)).toBe("冇\tmou5\t没有\n");
  });

  it("throws, naming the entry, when it is missing", () => {
    const zip = zipSync({ "other.txt": encode("x") });
    expect(() => readKaifangcidianZip(zip)).toThrow(new RegExp(ENTRY));
  });
});
