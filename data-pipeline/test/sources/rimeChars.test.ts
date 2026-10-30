import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { parseRimeChars } from "../../src/sources/rimeChars";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/rime-char.csv"), "utf8");
const HEADER = "char,jyutping,pron_rank,tone_var,literary_vernacular,comment";

describe("parseRimeChars", () => {
  it("parses the fixture with only known ranks and valid syllables", () => {
    const rows = parseRimeChars(fixture);
    expect(rows).toHaveLength(47);
    for (const r of rows) {
      expect(r.rank).toBeDefined();
      for (const s of r.jyutping.split(" ")) expect(isValidSyllable(s)).toBe(true);
    }
  });

  it("yields all six readings of 行 in order", () => {
    // Real data: 行 has no 預設 row.
    const xing = parseRimeChars(fixture)
      .filter((r) => r.char === "行")
      .map((r) => [r.jyutping, r.rank]);
    expect(xing).toEqual([
      ["haang4", "common"],
      ["hang4", "common"],
      ["hang6", "common"],
      ["hong2", "rare"],
      ["hong4", "common"],
      ["hong6", "obsolete"],
    ]);
  });

  it("keeps multi-syllable fixture rows as single readings", () => {
    const multi = parseRimeChars(fixture)
      .filter((r) => r.jyutping.includes(" "))
      .map((r) => [r.char, r.jyutping]);
    expect(multi).toEqual([
      ["䇆", "sap6 sing1"],
      ["䇉", "baak3 sing1"],
      ["兙", "sap6 hak1"],
    ]);
  });

  it("maps all four rank labels", () => {
    const rows = parseRimeChars(
      `${HEADER}\n甲,gaap3,預設,,,\n乙,jyut6,常用,,,\n丙,bing2,罕見,,,\n丁,ding1,棄用,,,\n`,
    );
    expect(rows.map((r) => r.rank)).toEqual(["default", "common", "rare", "obsolete"]);
  });

  it("leaves rank undefined for an empty rank cell", () => {
    expect(parseRimeChars(`${HEADER}\n甲,gaap3,,,,\n`)[0].rank).toBeUndefined();
  });

  it("throws naming an unknown rank value", () => {
    expect(() => parseRimeChars(`${HEADER}\n甲,gaap3,神秘,,,\n`)).toThrow(/神秘/);
  });

  it("treats Object.prototype names as unknown ranks", () => {
    for (const label of ["toString", "constructor", "__proto__"]) {
      expect(() => parseRimeChars(`${HEADER}\n甲,gaap3,${label},,,\n`)).toThrow(label);
    }
  });

  it("reports every problem in one error with line numbers", () => {
    const csv = `${HEADER}\n甲,xyz9,預設,,,\n乙,gaap3,預設,,,\n丙,gaap3,神秘,,,\n`;
    let message = "";
    try {
      parseRimeChars(csv);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("2 problem(s)");
    expect(message).toContain("line 2");
    expect(message).toContain("xyz9");
    expect(message).toContain("line 4");
    expect(message).toContain("神秘");
  });

  it("rejects an empty char, trims a padded one", () => {
    expect(() => parseRimeChars(`${HEADER}\n,gaap3,預設,,,\n`)).toThrow(/line 2/);
    expect(() => parseRimeChars(`${HEADER}\n甲乙,gaap3,預設,,,\n`)).toThrow(/line 2/);
    expect(parseRimeChars(`${HEADER}\n 甲 ,gaap3,預設,,,\n`)[0].char).toBe("甲");
  });

  it("keeps a multi-syllable cell as one reading", () => {
    const rows = parseRimeChars(`${HEADER}\n䇆,sap6  sing1,預設,,,\n`);
    expect(rows).toEqual([{ char: "䇆", jyutping: "sap6 sing1", rank: "default" }]);
  });

  it("parses BOM + CRLF input the same as the plain fixture", () => {
    expect(parseRimeChars("\uFEFF" + fixture.replace(/\n/g, "\r\n"))).toEqual(parseRimeChars(fixture));
  });
});
