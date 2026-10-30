import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { parseKaifangcidian, readKaifangcidianZip } from "../../src/sources/kaifangcidian";

const fixtureDir = join(import.meta.dirname, "../../fixtures");
const ft = readFileSync(join(fixtureDir, "kfcd-cidian-ft.txt"), "utf8");
const jt = readFileSync(join(fixtureDir, "kfcd-cidian-jt.txt"), "utf8");

const FT_HEADER =
  "開放粵語詞典（耶魯拼音數字調號版）\n\n© 2013年 kaifangcidian.com\n\n\n\n\n［粵語詞彙］\t［耶魯拼音］\t［國語解釋］\n\n";
const JT_HEADER =
  "开放粤语词典（耶鲁拼音数字调号版）\n\n© 2013年 kaifangcidian.com\n\n\n\n\n［粤语词汇］\t［耶鲁拼音］\t［国语解释］\n\n";

/** Parses an aligned inline pair: each row is [traditional line, simplified line] (data starts at line 10). */
function parsePair(...rows: [string, string][]) {
  return parseKaifangcidian(
    FT_HEADER + rows.map(([t]) => `${t}\n`).join(""),
    JT_HEADER + rows.map(([, s]) => `${s}\n`).join(""),
  );
}

describe("parseKaifangcidian", () => {
  it("keeps 34 of the 40 fixture rows, skips 6, and ignores the whitespace-only last line", () => {
    const { rows, skipped } = parseKaifangcidian(ft, jt);
    expect(rows).toHaveLength(34);
    expect(skipped).toHaveLength(6);
    expect(skipped.map((s) => s.line)).toEqual([16, 17, 18, 20, 21, 25]);
  });

  it("keeps 27 rows with at least one Mandarin equivalent and 7 without", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.filter((r) => r.mandarin.length > 0)).toHaveLength(27);
    expect(rows.filter((r) => r.mandarin.length === 0)).toHaveLength(7);
  });

  it("maps 冇 to 没有 / 没 / 无 with both scripts side by side", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "冇")).toEqual({
      word: "冇",
      wordSimp: "冇",
      syllables: ["mou5"],
      mandarin: [
        { trad: "沒有", simp: "没有" },
        { trad: "沒", simp: "没" },
        { trad: "無", simp: "无" },
      ],
    });
  });

  it("keeps the traditional and simplified headwords of a row whose scripts differ", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.syllables.join(" ") === "aa1 zoek3 mou4 sing1")).toEqual({
      word: "鴉雀無聲",
      wordSimp: "鸦雀无声",
      syllables: ["aa1", "zoek3", "mou4", "sing1"],
      mandarin: [],
    });
    expect(rows.find((r) => r.wordSimp === "冇办法")?.word).toBe("冇辦法");
  });

  it("keeps both readings of 嘅, each with its own Mandarin equivalents", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.filter((r) => r.word === "嘅")).toEqual([
      {
        word: "嘅",
        wordSimp: "嘅",
        syllables: ["ge2"],
        mandarin: [
          { trad: "呢", simp: "呢" },
          { trad: "嗎", simp: "吗" },
        ],
      },
      { word: "嘅", wordSimp: "嘅", syllables: ["ge3"], mandarin: [{ trad: "的", simp: "的" }] },
    ]);
  });

  it("gives an empty mandarin list to a row with no equivalent", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "吖啶")).toEqual({
      word: "吖啶",
      wordSimp: "吖啶",
      syllables: ["aa1", "ding6"],
      mandarin: [],
    });
  });

  it("converts checked tones and eu / yu finals in multi-syllable words", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "穿靴戴帽")?.syllables).toEqual(["cyun1", "hoe1", "daai3", "mou6"]);
    expect(rows.find((r) => r.word === "月圓花好")?.syllables).toEqual(["jyut6", "jyun4", "faa1", "hou2"]);
    expect(rows.find((r) => r.word === "月圓花好")?.wordSimp).toBe("月圆花好");
  });

  it("splits Mandarin on the full-width comma and also on 、 and ；, pairing items by position", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "冇把炮")?.mandarin).toEqual([
      { trad: "沒有把握", simp: "没有把握" },
      { trad: "沒有依靠", simp: "没有依靠" },
      { trad: "沒本事", simp: "没本事" },
    ]);
    expect(rows.find((r) => r.word === "街數")?.mandarin).toEqual([
      { trad: "債務", simp: "债务" },
      { trad: "外賬", simp: "外账" },
      { trad: "外債", simp: "外债" },
    ]);
    expect(rows.find((r) => r.word === "波棍")?.mandarin.map((m) => m.simp)).toEqual(["换档杆", "变速杆"]);
    expect(rows.find((r) => r.word === "鴨仔")?.mandarin.map((m) => m.trad)).toEqual(["小鴨", "小鴨子"]);
  });

  it("de-duplicates on the (trad, simp) pair, keeping first-seen order", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "茭筍")?.mandarin).toEqual([
      { trad: "茭白", simp: "茭白" },
      { trad: "茭白筍", simp: "茭白笋" },
    ]);
    expect(rows.find((r) => r.word === "穿窿")?.mandarin.map((m) => m.simp)).toEqual([
      "穿洞", "穿孔", "穿洞的", "穿孔的", "洞穿的", "出现破洞", "穿了个洞", "破了个洞", "穿了个窟窿",
    ]);
  });

  it("keeps a pair that differs in one script only (not a duplicate)", () => {
    const { rows } = parsePair(["甲\tgaap3\t髮，發", "甲\tgaap3\t发，发"]);
    expect(rows[0]?.mandarin).toEqual([
      { trad: "髮", simp: "发" },
      { trad: "發", simp: "发" },
    ]);
  });

  it("keeps annotations and ellipses inside an equivalent as written", () => {
    const { rows } = parseKaifangcidian(ft, jt);
    expect(rows.find((r) => r.word === "行埋")?.mandarin).toEqual([
      { trad: "（婉）性交", simp: "（婉）性交" },
      { trad: "同房", simp: "同房" },
    ]);
    expect(rows.find((r) => r.word === "咋")?.mandarin).toEqual([{ trad: "…而已呀", simp: "…而已呀" }]);
  });

  it("skips a row whose converted syllable is not valid Jyutping, naming its line", () => {
    const { rows, skipped } = parseKaifangcidian(ft, jt);
    expect(rows.some((r) => r.word === "IP" || r.word === "M")).toBe(false);
    expect(skipped.find((s) => s.line === 17)?.message).toMatch(/invalid syllable "pi1".*IP/);
    expect(skipped.find((s) => s.line === 25)?.message).toMatch(/invalid syllable "em1".*M/);
  });

  it("skips a row whose syllable count differs from its character count, naming its line", () => {
    const { rows, skipped } = parseKaifangcidian(ft, jt);
    expect(rows.some((r) => r.word === "亞sir" || r.word === "…親")).toBe(false);
    expect(skipped.find((s) => s.line === 16)?.message).toMatch(/亞sir has 4 characters but 2 syllables/);
    expect(skipped.find((s) => s.line === 20)?.message).toMatch(/…親 has 2 characters but 1 syllables/);
  });

  it("skips a row whose romanization has an unknown Yale syllable, naming its line", () => {
    const { rows, skipped } = parsePair(["冇\tmou5\t沒有", "冇\tmou5\t没有"], ["冇\txyz5\t沒有", "冇\txyz5\t没有"]);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.line).toBe(11);
    expect(skipped[0]?.message).toMatch(/cannot convert Yale syllable "xyz5"/);
  });

  it("skips a row whose romanization differs between the two files, naming its line", () => {
    const { rows, skipped } = parsePair(["冇\tmou5\t沒有", "冇\tmou5\t没有"], ["冇\tmou5\t沒有", "冇\tmou6\t没有"]);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.line).toBe(11);
    expect(skipped[0]?.message).toMatch(/romanization differs.*"mou5".*"mou6"/);
  });

  it("skips a row whose Mandarin item counts differ between the two files, naming its line", () => {
    const { rows, skipped } = parsePair(["冇\tmou5\t沒有，沒，無", "冇\tmou5\t没有，没"]);
    expect(rows).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.line).toBe(10);
    expect(skipped[0]?.message).toMatch(/3 traditional but 2 simplified Mandarin equivalents/);
  });

  it("accepts CRLF line endings", () => {
    const { rows } = parseKaifangcidian(
      `${FT_HEADER}冇\tmou5\t沒有，沒，無\n`.replace(/\n/g, "\r\n"),
      `${JT_HEADER}冇\tmou5\t没有，没，无\n`.replace(/\n/g, "\r\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.mandarin).toHaveLength(3);
  });

  it("throws when either file's column header is missing (wrong or changed file)", () => {
    const body = "冇\tmou5\t没有\n";
    expect(() => parseKaifangcidian(`${FT_HEADER}${body}`, body)).toThrow(/simplified.*column header/s);
    expect(() => parseKaifangcidian(body, `${JT_HEADER}${body}`)).toThrow(/traditional.*column header/s);
    // The two files swapped is also caught, since each header is script-specific.
    expect(() => parseKaifangcidian(`${JT_HEADER}${body}`, `${FT_HEADER}${body}`)).toThrow(/column header/);
  });

  it("throws when the two files have different line counts", () => {
    expect(() =>
      parseKaifangcidian(`${FT_HEADER}冇\tmou5\t沒有\n冇\tmou5\t沒有\n`, `${JT_HEADER}冇\tmou5\t没有\n`),
    ).toThrow(/line counts differ.*12.*11/s);
  });

  it("throws, listing every offending line, for a row without exactly three columns", () => {
    const bad = ["冇\tmou5", "冇\tmou5\t沒有\textra", "\tmou5\t沒有", "冇\t\t沒有"];
    const badSimp = bad.map((l) => l);
    const text = (header: string, lines: string[]) => `${header}${lines.join("\n")}\n`;
    expect(() => parseKaifangcidian(text(FT_HEADER, bad), text(JT_HEADER, badSimp))).toThrow(
      /line 10:.*line 11:.*line 12:.*line 13:/s,
    );
  });
});

describe("readKaifangcidianZip", () => {
  const TRAD_ENTRY = "cidian_zhyue-ft-kfcd-ylshu-2021714.txt";
  const SIMP_ENTRY = "cidian_zhyue-jt-kfcd-ylshu-2021714.txt";
  const encode = (s: string) => new TextEncoder().encode(s);

  it("returns the text of both pinned entries, ignoring the other entries", () => {
    const zip = zipSync({
      [TRAD_ENTRY]: encode("冇\tmou5\t沒有\n"),
      [SIMP_ENTRY]: encode("冇\tmou5\t没有\n"),
      "other.txt": encode("not this one"),
    });
    expect(readKaifangcidianZip(zip)).toEqual({ trad: "冇\tmou5\t沒有\n", simp: "冇\tmou5\t没有\n" });
  });

  it.each([TRAD_ENTRY, SIMP_ENTRY])("throws, naming the entry, when %s is missing", (missing) => {
    const present = missing === TRAD_ENTRY ? SIMP_ENTRY : TRAD_ENTRY;
    const zip = zipSync({ [present]: encode("x") });
    expect(() => readKaifangcidianZip(zip)).toThrow(new RegExp(missing));
  });
});
