import { RIME_DICT_END_MARKER, rimeDictBody, splitLines } from "../../src/sources/text";

describe("splitLines", () => {
  it("splits on LF", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
  });

  it("handles BOM and CRLF identically to plain LF", () => {
    expect(splitLines("\uFEFFa\r\nb\r\n")).toEqual(splitLines("a\nb\n"));
  });
});

describe("rimeDictBody", () => {
  it("returns lines after the end marker with 1-based line numbers, minus blanks and comments", () => {
    const text = ["# c", "---", "name: x", RIME_DICT_END_MARKER, "", "# note", "甲\tgaap3", "", "乙\tjyut6"].join("\n");
    expect(rimeDictBody(text)).toEqual([
      { lineNumber: 7, line: "甲\tgaap3" },
      { lineNumber: 9, line: "乙\tjyut6" },
    ]);
  });

  it("strips a BOM and accepts CRLF", () => {
    expect(rimeDictBody("\uFEFF---\r\n...\r\n甲\tgaap3\r\n")).toEqual([{ lineNumber: 3, line: "甲\tgaap3" }]);
  });

  it("throws when the end marker is missing", () => {
    expect(() => rimeDictBody("---\nname: x\n甲\tgaap3\n")).toThrow(/end marker/);
  });
});
