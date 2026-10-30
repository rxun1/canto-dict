import { parseJyutpingCell, syllableCountMismatch } from "../../src/sources/jyutpingCell";

describe("parseJyutpingCell", () => {
  it("returns ok with trimmed, whitespace-split syllables", () => {
    expect(parseJyutpingCell("  sap6\t sing1 ")).toEqual({ kind: "ok", syllables: ["sap6", "sing1"] });
    expect(parseJyutpingCell("jau1")).toEqual({ kind: "ok", syllables: ["jau1"] });
  });

  it("returns invalid with all syllables and the first bad one", () => {
    expect(parseJyutpingCell("gaap3 zzz1 Ding1")).toEqual({
      kind: "invalid",
      syllables: ["gaap3", "zzz1", "Ding1"],
      invalid: "zzz1",
    });
  });

  it("returns empty for an empty or whitespace-only cell", () => {
    expect(parseJyutpingCell("")).toEqual({ kind: "empty" });
    expect(parseJyutpingCell(" \t ")).toEqual({ kind: "empty" });
  });
});

describe("syllableCountMismatch", () => {
  it("returns undefined when the syllable count equals the code-point count", () => {
    expect(syllableCountMismatch("你好", ["nei5", "hou2"])).toBeUndefined();
    expect(syllableCountMismatch("𭉝𭉝", ["syu4", "syu2"])).toBeUndefined();
  });

  it("describes a mismatch, counting code points not UTF-16 units", () => {
    expect(syllableCountMismatch("你好", ["nei5"])).toBe("你好 has 2 characters but 1 syllables");
    expect(syllableCountMismatch("𭉝", ["a1", "b1"])).toBe("𭉝 has 1 characters but 2 syllables");
  });
});
