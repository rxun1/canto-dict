import { chrf, corpusChrf } from "./chrf";

describe("chrf (sacreBLEU's chrF: character n-grams 1–6, β = 2)", () => {
  it("is 100 for identical text and 0 for no shared character", () => {
    expect(chrf("abc", "abc")).toBe(100);
    expect(chrf("abc", "xyz")).toBe(0);
  });

  it("averages precision and recall over the orders both sides have, then weights recall (β = 2)", () => {
    // Order 1: P = 2/2, R = 2/3. Order 2: P = 1/1, R = 1/2. Order 3: the hypothesis has none, so skipped.
    // P = 1, R = 7/12, F2 = 5PR / (4P + R) = 35/55.
    expect(chrf("ab", "abc")).toBeCloseTo((100 * 35) / 55, 10);
  });

  it("ignores whitespace", () => {
    expect(chrf("a b c", "abc")).toBe(100);
  });

  it("counts characters by code point, outside the BMP too", () => {
    // U+20BB6 and U+20BB7 share their UTF-16 high surrogate.
    expect(chrf("𠮶", "𠮷")).toBe(0);
  });

  it("is 0 when either side is empty", () => {
    expect(chrf("", "abc")).toBe(0);
    expect(chrf("abc", "")).toBe(0);
  });
});

describe("corpusChrf", () => {
  it("sums n-gram counts over all pairs before scoring", () => {
    // Order 1: 3 of 4 match both ways; orders 2 and 3 come from "abc" alone and all match.
    expect(corpusChrf([["abc", "abc"], ["x", "y"]])).toBeCloseTo((100 * (0.75 + 1 + 1)) / 3, 10);
  });
});
