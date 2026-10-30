import { charFromCodePointNotation, isSingleCodePoint } from "../../src/sources/codePoints";

describe("charFromCodePointNotation", () => {
  it("converts BMP and supplementary-plane notation", () => {
    expect(charFromCodePointNotation("U+4E94")).toBe("五");
    expect(charFromCodePointNotation("U+20BE2")).toBe("𠯢");
    expect(charFromCodePointNotation("U+10FFFF")).toBe("\u{10FFFF}");
  });

  it("returns undefined for malformed notation", () => {
    for (const cell of ["4E94", "U+4e94", "U+4E9", "U+1234567", "U+ZZZZ", "u+4E94", " U+4E94", "U+4E94 五", ""]) {
      expect(charFromCodePointNotation(cell)).toBeUndefined();
    }
  });

  it("returns undefined above U+10FFFF and for surrogates", () => {
    expect(charFromCodePointNotation("U+110000")).toBeUndefined();
    expect(charFromCodePointNotation("U+FFFFFF")).toBeUndefined();
    expect(charFromCodePointNotation("U+D800")).toBeUndefined();
    expect(charFromCodePointNotation("U+DFFF")).toBeUndefined();
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
