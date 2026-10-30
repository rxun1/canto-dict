import { parseJyutpingCell } from "../../src/sources/jyutpingCell";

describe("parseJyutpingCell", () => {
  it("trims and splits on any whitespace", () => {
    expect(parseJyutpingCell("  sap6\t sing1 ")).toEqual({ syllables: ["sap6", "sing1"], invalid: undefined });
    expect(parseJyutpingCell("jau1")).toEqual({ syllables: ["jau1"], invalid: undefined });
  });

  it("reports the first invalid syllable", () => {
    expect(parseJyutpingCell("gaap3 zzz1 Ding1")).toEqual({ syllables: ["gaap3", "zzz1", "Ding1"], invalid: "zzz1" });
  });

  it("treats an empty cell as invalid (callers decide whether empty is allowed)", () => {
    expect(parseJyutpingCell("  ").invalid).toBe("");
  });
});
