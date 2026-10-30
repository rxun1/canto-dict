import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLshk } from "../../src/sources/lshk";
import { parseUnihan } from "../../src/sources/unihan";
import { LSHK_CACHE_NAME } from "../../src/sources/urls";

const fixtureDir = join(import.meta.dirname, "../../fixtures");
const lshkFixture = readFileSync(join(fixtureDir, "lshk-list.tsv"), "utf8");
const unihanFixture = readFileSync(join(fixtureDir, "unihan-kcantonese.txt"), "utf8");
const LSHK_HEADER = "CH\tUCODE\tJP\tINIT\tFINL\tTONE\tDESC\tDESC_JP\r\n";
const lshkRow = (ch: string, ucode: string, jp: string) => `${ch}\t${ucode}\t${jp}\t\t\t\t\t\r\n`;

describe("parseLshk", () => {
  it("keeps the 23 fixture rows that have Jyutping; the 4 empty-JP rows are ignored silently", () => {
    const { readings, skipped } = parseLshk(lshkFixture);
    expect(readings).toHaveLength(23);
    expect(skipped).toEqual([]);
  });

  it("returns { char, jyutping } with rank undefined", () => {
    const { readings } = parseLshk(lshkFixture);
    expect(readings[0]).toEqual({ char: "㐀", jyutping: "jau1", rank: undefined });
    for (const r of readings) expect(r.rank).toBeUndefined();
  });

  it("keeps merged ('lazy') readings as ordinary rows in file order, untagged", () => {
    const { readings } = parseLshk(lshkFixture);
    expect(readings.filter((r) => r.char === "五").map((r) => r.jyutping)).toEqual(["ng5", "m5"]);
    expect(readings.filter((r) => r.char === "你").map((r) => r.jyutping)).toEqual(["nei5", "lei5"]);
    expect(readings.filter((r) => r.char === "我").map((r) => r.jyutping)).toEqual(["ngo5", "o5"]);
  });

  it("keeps supplementary-plane characters as one code point", () => {
    const { readings } = parseLshk(lshkFixture);
    expect(readings.find((r) => r.char === "𤾆")).toEqual({ char: "𤾆", jyutping: "dau1", rank: undefined });
  });

  it("keeps a multi-syllable reading as one reading with single spaces", () => {
    const { readings } = parseLshk(lshkFixture);
    expect(readings.filter((r) => r.char === "卅").map((r) => r.jyutping)).toEqual(["saa1 aa6"]);
    expect(readings.filter((r) => r.char === "𠯢").map((r) => r.jyutping)).toEqual(["saa1 aa6"]);
  });

  it("ignores rows whose JP column is empty, even for a supplementary-plane char", () => {
    const { readings } = parseLshk(lshkFixture);
    expect(readings.filter((r) => r.char === "𥪕")).toEqual([]);
    expect(readings.filter((r) => r.char === "㓁").map((r) => r.jyutping)).toEqual(["mong5"]);
  });

  it("throws on an unrecognized header", () => {
    expect(() => parseLshk("char\tcode\tjp\r\n")).toThrow(/line 1:.*header/);
  });

  it("throws on a wrong column count", () => {
    expect(() => parseLshk(`${LSHK_HEADER}甲\tU+7532\tgaap3\r\n`)).toThrow(/line 2:.*columns/);
  });

  it("throws on a malformed U+XXXX or one that does not match the character", () => {
    expect(() => parseLshk(`${LSHK_HEADER}${lshkRow("甲", "7532", "gaap3")}`)).toThrow(/line 2:.*U\+XXXX/);
    expect(() => parseLshk(`${LSHK_HEADER}${lshkRow("甲", "U+4E59", "gaap3")}`)).toThrow(/line 2:.*U\+4E59/);
  });

  it("throws when the char column is not exactly one code point", () => {
    expect(() => parseLshk(`${LSHK_HEADER}${lshkRow("甲乙", "U+7532", "gaap3")}`)).toThrow(/line 2:.*one/);
  });

  it("skips a row with an invalid syllable and reports its 1-based line number", () => {
    const text = `${LSHK_HEADER}${lshkRow("甲", "U+7532", "gaap3")}${lshkRow("乙", "U+4E59", "zzz1")}${lshkRow("丙", "U+4E19", "bing2 Ding1")}`;
    const { readings, skipped } = parseLshk(text);
    expect(readings).toEqual([{ char: "甲", jyutping: "gaap3", rank: undefined }]);
    expect(skipped.map((s) => s.line)).toEqual([3, 4]);
    expect(skipped[0].message).toMatch(/invalid syllable "zzz1"/);
    expect(skipped[1].message).toMatch(/Ding1/);
  });

  it("ignores blank lines and a trailing newline", () => {
    const { readings } = parseLshk(`${LSHK_HEADER}\r\n${lshkRow("甲", "U+7532", "gaap3")}\r\n`);
    expect(readings).toHaveLength(1);
  });
});

describe("parseUnihan", () => {
  it("parses all 23 fixture rows as { char, jyutping } with rank undefined", () => {
    const { readings, skipped } = parseUnihan(unihanFixture);
    expect(readings).toHaveLength(23);
    expect(skipped).toEqual([]);
    expect(readings[0]).toEqual({ char: "㐀", jyutping: "jau1", rank: undefined });
    for (const r of readings) expect(r.rank).toBeUndefined();
  });

  it("converts U+XXXX to the character, including supplementary planes", () => {
    const { readings } = parseUnihan(unihanFixture);
    expect(readings.find((r) => r.char === "五")?.jyutping).toBe("ng5");
    expect(readings.find((r) => r.char === "𤾆")?.jyutping).toBe("dau1");
    expect(readings.find((r) => r.char === "𲀃")?.jyutping).toBe("bang1");
  });

  it("accepts the official Unihan_Readings.txt layout: comments and other properties are ignored", () => {
    const text = [
      "# Unihan_Readings.txt",
      "# Unicode Version 17.0.0",
      "",
      "U+3400\tkCantonese\tjau1",
      "U+3400\tkDefinition\t(same as U+4E18 丘) hillock or mound",
      "U+3400\tkMandarin\tqiū",
      "U+20BE2\tkCantonese\tsaa1",
      "# EOF",
    ].join("\n");
    expect(parseUnihan(text).readings).toEqual([
      { char: "㐀", jyutping: "jau1", rank: undefined },
      { char: "𠯢", jyutping: "saa1", rank: undefined },
    ]);
  });

  it("emits one CharReading per space-separated reading, in order", () => {
    const { readings } = parseUnihan("U+4E94\tkCantonese\tng5 m5\n");
    expect(readings).toEqual([
      { char: "五", jyutping: "ng5", rank: undefined },
      { char: "五", jyutping: "m5", rank: undefined },
    ]);
  });

  it("throws on a malformed code point, a wrong column count, or a mismatching character", () => {
    expect(() => parseUnihan("U+4E94\tkCantonese\tng5\nU+ZZZZ\tkCantonese\tng5\n")).toThrow(/line 2:.*U\+XXXX/);
    expect(() => parseUnihan("U+4E94\tkCantonese\n")).toThrow(/line 1:.*columns/);
    expect(() => parseUnihan("U+4E94 你\tkCantonese\tng5\n")).toThrow(/line 1:.*你/);
    expect(() => parseUnihan("U+110000\tkCantonese\tng5\n")).toThrow(/line 1:.*U\+XXXX/);
  });

  it("skips an invalid syllable with its line number but keeps the other readings of that row", () => {
    const { readings, skipped } = parseUnihan("# c\nU+4E94\tkCantonese\tng5 zzz1\nU+4F60\tkCantonese\tnei5\n");
    expect(readings.map((r) => r.char + r.jyutping)).toEqual(["五ng5", "你nei5"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(2);
    expect(skipped[0].message).toMatch(/invalid syllable "zzz1"/);
  });
});

const fullLshkPath = join(import.meta.dirname, "../../.cache", LSHK_CACHE_NAME);

describe("full LSHK file (only when the pinned file is in .cache)", () => {
  it.skipIf(!existsSync(fullLshkPath))("has only syllables that pass isValidSyllable", () => {
    const { readings, skipped } = parseLshk(readFileSync(fullLshkPath, "utf8"));
    expect(skipped).toEqual([]);
    expect(readings).toHaveLength(38194);
  });
});
