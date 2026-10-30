import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidSyllable } from "../../../src/jyutping/syllables";
import { RANK_BY_RIME_LABEL, parseRimeChars } from "../../src/sources/rimeChars";

const fixture = readFileSync(join(import.meta.dirname, "../../fixtures/rime-char.csv"), "utf8");
const HEADER = "char,jyutping,pron_rank,tone_var,literary_vernacular,comment";

describe("parseRimeChars", () => {
  it("parses the fixture with only known ranks and valid syllables", () => {
    const rows = parseRimeChars(fixture);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      expect(r.rank).toBeDefined();
      for (const s of r.jyutping.split(" ")) expect(isValidSyllable(s)).toBe(true);
    }
  });

  it("yields all readings of 行, including hang4 and hong4", () => {
    const xing = parseRimeChars(fixture).filter((r) => r.char === "行");
    // Real data: 行 has no 預設 row; hang4 and hong4 are both 常用.
    expect(xing.find((r) => r.jyutping === "hang4")?.rank).toBe("common");
    expect(xing.find((r) => r.jyutping === "hong4")?.rank).toBe("common");
    expect(xing.find((r) => r.jyutping === "hong6")?.rank).toBe("obsolete");
    expect(xing).toHaveLength(6);
  });

  it("keeps multi-syllable fixture rows as single readings", () => {
    const multi = parseRimeChars(fixture).filter((r) => r.jyutping.includes(" "));
    expect(multi.length).toBeGreaterThan(0);
  });

  it("maps all four rank labels", () => {
    expect(RANK_BY_RIME_LABEL).toEqual({
      預設: "default",
      常用: "common",
      罕見: "rare",
      棄用: "obsolete",
    });
    const rows = parseRimeChars(
      `${HEADER}\n甲,gaap3,預設,,,\n乙,jyut6,常用,,,\n丙,bing2,罕見,,,\n丁,ding1,棄用,,,\n`,
    );
    expect(rows.map((r) => r.rank)).toEqual(["default", "common", "rare", "obsolete"]);
  });

  it("throws naming an unknown rank value", () => {
    expect(() => parseRimeChars(`${HEADER}\n甲,gaap3,神秘,,,\n`)).toThrow(/神秘/);
  });

  it("throws naming the char for an invalid syllable", () => {
    expect(() => parseRimeChars(`${HEADER}\n甲,xyz9,預設,,,\n`)).toThrow(/甲.*xyz9/);
  });

  it("parses BOM + CRLF identically", () => {
    const crlf = "﻿" + fixture.replace(/\n/g, "\r\n");
    expect(parseRimeChars(crlf)).toEqual(parseRimeChars(fixture));
  });

  it("keeps a multi-syllable cell as one reading", () => {
    const rows = parseRimeChars(`${HEADER}\n䇆,sap6  sing1,預設,,,\n`);
    expect(rows).toEqual([{ char: "䇆", jyutping: "sap6 sing1", rank: "default" }]);
  });

  it("leaves rank undefined for an empty rank cell", () => {
    expect(parseRimeChars(`${HEADER}\n甲,gaap3,,,,\n`)[0].rank).toBeUndefined();
  });
});
