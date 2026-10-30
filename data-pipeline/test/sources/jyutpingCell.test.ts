import { parseJyutpingCell } from "../../src/sources/jyutpingCell";

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
