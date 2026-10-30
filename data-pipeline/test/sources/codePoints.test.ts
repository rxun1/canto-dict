import { CODE_POINT_ERROR_MESSAGE, isSingleCodePoint, parseCodePointNotation } from "../../src/sources/codePoints";

describe("parseCodePointNotation", () => {
  it("converts BMP and supplementary-plane notation", () => {
    expect(parseCodePointNotation("U+4E94")).toEqual({ char: "五" });
    expect(parseCodePointNotation("U+20BE2")).toEqual({ char: "𠯢" });
    expect(parseCodePointNotation("U+10FFFF")).toEqual({ char: "\u{10FFFF}" });
  });

  it("classifies malformed notation", () => {
    for (const cell of ["4E94", "U+4e94", "U+4E9", "U+1234567", "U+ZZZZ", "u+4E94", " U+4E94", "U+4E94 五", ""]) {
      expect(parseCodePointNotation(cell)).toEqual({ error: "malformed" });
    }
  });

  it("classifies well-formed but non-scalar values (above U+10FFFF, surrogates)", () => {
    for (const cell of ["U+110000", "U+FFFFFF", "U+D800", "U+DFFF"]) {
      expect(parseCodePointNotation(cell)).toEqual({ error: "non-scalar" });
    }
  });

  it("has one distinct message per error kind", () => {
    expect(CODE_POINT_ERROR_MESSAGE.malformed).toMatch(/U\+XXXX/);
    expect(CODE_POINT_ERROR_MESSAGE["non-scalar"]).toMatch(/not a Unicode scalar value/);
  });
});

describe("isSingleCodePoint", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(isSingleCodePoint("五")).toBe(true);
    expect(isSingleCodePoint("𠯢")).toBe(true);
    expect(isSingleCodePoint("")).toBe(false);
    expect(isSingleCodePoint("五你")).toBe(false);
  });
});
