import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOEDICT_ATTRIBUTION, parseMoedict, readXzText } from "../../src/sources/moedict";
import { MOEDICT_RELEASE } from "../../src/sources/urls";

const fixtureDir = join(import.meta.dirname, "../../fixtures");
const samplePath = join(fixtureDir, "moedict-sample.json");
const sample = readFileSync(samplePath, "utf8");

/** Parses inline entries (plain objects, serialized like the source). */
const parseEntries = (...entries: unknown[]) => parseMoedict(JSON.stringify(entries));

/** One entry with a single heteronym holding the given definitions. */
const entry = (title: unknown, ...definitions: unknown[]) => ({ heteronyms: [{ definitions }], title });

describe("parseMoedict", () => {
  it("keeps 9 of the 13 fixture entries, in file order", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.map((r) => r.word)).toEqual(["不行", "並排", "侄", "好玩", "學校", "楊堅", "沒有", "維德角共和國", "隻"]);
  });

  it("gives 學校 its Mandarin definition", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "學校")).toEqual({ word: "學校", senses: [{ def: "講學研習的教育機構。" }] });
  });

  it("keeps every sense of a multi-sense word in order", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "沒有")?.senses).toEqual([{ def: "無。" }, { def: "未。" }]);
    expect(rows.find((r) => r.word === "不行")?.senses).toHaveLength(11);
  });

  it("flattens the senses of all heteronyms of a polyphonic word in file order", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "好玩")?.senses).toEqual([
      { def: "有趣。如：「跟那種呆板的人出遊，有什麼好玩的。」也作「好頑」。" },
      { def: "愛玩。" },
      { def: "供賞玩的物品。" },
    ]);
  });

  it("keeps the part of speech from `type` and leaves it out when absent", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "侄")?.senses).toEqual([{ pos: "形", def: "堅固、牢固。" }]);
    const xue = rows.find((r) => r.word === "學校")!;
    expect(Object.keys(xue.senses[0]!)).toEqual(["def"]);
  });

  it("strips zero-width characters (U+FEFF, U+200B) but changes nothing else", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "並排")?.senses).toEqual([{ def: "排列在同一線上，不分前後。" }]);
    const { rows: inline } = parseEntries(entry("字", { def: "甲\u200B乙\uFEFF丙。" }));
    expect(inline[0]?.senses).toEqual([{ def: "甲乙丙。" }]);
  });

  it("keeps definitions verbatim, including a ~ that is part of the text", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "楊堅")?.senses).toEqual([
      { def: "人名。（西元541~604）華陰人，隋朝的開國君主。初仕北周，封隨國公，後弒靜帝自立，國號隋。在位二十四年，後為次子楊廣所弒。諡文。" },
    ]);
  });

  it("trims whitespace around titles and definitions", () => {
    const { rows } = parseMoedict(sample);
    expect(rows.find((r) => r.word === "維德角共和國")).toBeDefined();
    expect(rows.find((r) => r.word === "不行")?.senses.slice(-2)).toEqual([
      { def: "病情嚴重，將近死亡。" },
      { def: "不得了。形容程度極深。" },
    ]);
  });

  it("skips 2 entries and 4 senses of the fixture, locating each by entry number", () => {
    const { skipped } = parseMoedict(sample);
    expect(skipped.map((s) => s.line)).toEqual([1, 4, 5, 6, 12, 13]);
  });

  it("skips an entry whose headword has a {[xxxx]} placeholder or a Private Use Area character", () => {
    const { rows, skipped } = parseMoedict(sample);
    expect(rows.some((r) => r.word.includes("{["))).toBe(false);
    expect(rows.some((r) => r.word === "\u{F06EB}")).toBe(false);
    expect(skipped[0]?.message).toContain("{[9677]}");
    expect(skipped[5]?.message).toContain("U+F06EB");
  });

  it("skips a sense whose definition has a rare-character placeholder, image reference or Private Use Area character", () => {
    const { rows, skipped } = parseMoedict(sample);
    const zhi = rows.find((r) => r.word === "隻")!;
    expect(zhi.senses).toEqual([
      { pos: "形", def: "孤獨的、單獨的。" },
      { pos: "形", def: "奇數、單一的。" },
      { pos: "形", def: "獨特的、特殊的。" },
    ]);
    expect(skipped[4]?.message).toContain("{[f4ff2]}");
    expect(skipped[2]?.message).toContain("&3898_.gif;");
    expect(skipped[3]?.message).toContain("U+FA7D1");
    // 咳唾成珠 and 嘅 had a single sense each, so they give no row.
    expect(rows.find((r) => r.word === "咳唾成珠" || r.word === "嘅")).toBeUndefined();
  });

  it("skips an empty definition, reporting its cross-reference", () => {
    const { skipped } = parseMoedict(sample);
    expect(skipped[1]?.message).toContain("侄");
    expect(skipped[1]?.message).toContain("同「姪」。");
  });

  it("throws on a file that is not a JSON array of entries", () => {
    expect(() => parseMoedict("{")).toThrow(/not valid JSON/);
    expect(() => parseMoedict('{"title": "學校"}')).toThrow(/array/);
    expect(() => parseMoedict("[]")).toThrow(/no entries/);
  });

  it("throws on entries of the wrong shape, collecting every problem", () => {
    const run = () =>
      parseEntries(
        entry("學校", { def: "講學研習的教育機構。" }),
        { heteronyms: [] },
        { title: "甲", heteronyms: [{}] },
        entry("乙", { type: "名" }),
        entry("丙", { def: "丙。", type: 1 }),
        entry("  ", { def: "空。" }),
      );
    expect(run).toThrow(/has 5 problem/);
    expect(run).toThrow(/line 2: .*title/);
    expect(run).toThrow(/line 3: .*definitions/);
    expect(run).toThrow(/line 4: .*def/);
    expect(run).toThrow(/line 5: .*type/);
    expect(run).toThrow(/line 6: .*empty title/);
  });
});

describe("readXzText", () => {
  it("decompresses an xz file to its UTF-8 text", async () => {
    expect(await readXzText(join(fixtureDir, "moedict-sample.json.xz"))).toBe(sample);
  });

  it("rejects a file that is not xz", async () => {
    await expect(readXzText(samplePath)).rejects.toThrow();
  });
});

describe("MOEDICT_ATTRIBUTION", () => {
  it("credits the Ministry of Education's dictionary and release as its usage notes require", () => {
    expect(MOEDICT_ATTRIBUTION).toBe(
      `中華民國教育部（Ministry of Education, R.O.C.）。《重編國語辭典修訂本》（版本編號：${MOEDICT_RELEASE}）網址：http://dict.revised.moe.edu.tw/`,
    );
  });
});
