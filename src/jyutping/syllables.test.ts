// Shared test: uses only global describe/it/expect (runs under vitest now, Jest later).
import { isValidSyllable, splitSyllables, normalize, stripTones } from "./syllables";

describe("isValidSyllable", () => {
  it("accepts attested syllables with tones 1-6", () => {
    expect(isValidSyllable("sik1")).toBe(true);
    expect(isValidSyllable("faan6")).toBe(true);
  });
  it("rejects bad tones and missing tones", () => {
    expect(isValidSyllable("sik7")).toBe(false);
    expect(isValidSyllable("sik0")).toBe(false);
    expect(isValidSyllable("sik")).toBe(false);
  });
  it("rejects non-attested bases and bad shapes", () => {
    expect(isValidSyllable("xyz1")).toBe(false);
    expect(isValidSyllable("")).toBe(false);
    expect(isValidSyllable("SIK1")).toBe(false);
    expect(isValidSyllable("sik12")).toBe(false);
  });
  it("accepts syllabic m and ng", () => {
    expect(isValidSyllable("m4")).toBe(true);
    expect(isValidSyllable("ng5")).toBe(true);
  });
  it("accepts sentence-final particles", () => {
    expect(isValidSyllable("la1")).toBe(true);
    expect(isValidSyllable("ga3")).toBe(true);
  });
  it("accepts a hand-copied sample of real LSHK syllables", () => {
    const sample = [
      "aa3", "ai4", "e6", "ngm4", "ngo5", "gwo2", "kwu1", "gwaak3", "kwaang4",
      "coeng4", "zeoi6", "soeng5", "oi3", "jyun4", "ngit6", "zyun2", "hung1",
      "ngaap3", "gwui6", "mou4", "baak3", "dung6", "tuk1", "cam4",
    ];
    for (const s of sample) expect([s, isValidSyllable(s)]).toEqual([s, true]);
  });
});

describe("splitSyllables", () => {
  it("splits toneless run-together syllables", () => {
    expect(splitSyllables("sikfaan")).toEqual(["sik", "faan"]);
  });
  it("splits space-separated toned syllables", () => {
    expect(splitSyllables("sik6 faan6")).toEqual(["sik6", "faan6"]);
  });
  it("splits run-together toned syllables, keeping the digits", () => {
    expect(splitSyllables("sik6faan6")).toEqual(["sik6", "faan6"]);
  });
  it("backtracks when the longest match fails", () => {
    // greedy longest match takes "ai" first, leaving "t" (invalid); must fall back to "a" + "it"
    expect(splitSyllables("ait")).toEqual(["a", "it"]);
    expect(splitSyllables("hoengging")).toEqual(["hoeng", "ging"]);
  });
  it("returns null for non-Jyutping text", () => {
    expect(splitSyllables("water")).toBeNull();
    expect(splitSyllables("xyz")).toBeNull();
    expect(splitSyllables("sik faanx")).toBeNull();
    expect(splitSyllables("sik7")).toBeNull();
  });
  it("fails fast on long input that is not splittable", () => {
    expect(splitSyllables("ngaa".repeat(50) + "x")).toBeNull();
  });
  it("splits long valid input", () => {
    const result = splitSyllables("sikfaan".repeat(20));
    expect(result).toHaveLength(40);
    expect(result?.slice(0, 2)).toEqual(["sik", "faan"]);
  });
  it("returns null for empty or whitespace input", () => {
    expect(splitSyllables("")).toBeNull();
    expect(splitSyllables("   ")).toBeNull();
  });
  it("'eat' really is e + at in the attested data", () => {
    // Plan expected null, but both 'e' and 'at' are attested LSHK syllables, so it splits.
    // The input classifier must therefore treat Jyutping-parsability as a hint, not proof.
    expect(splitSyllables("eat")).toEqual(["e", "at"]);
  });
});

describe("normalize / stripTones", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalize(" SIK6 Faan6 ")).toBe("sik6 faan6");
    expect(normalize("sik6   \t faan6")).toBe("sik6 faan6");
  });
  it("strips tone digits", () => {
    expect(stripTones("sik6faan6")).toBe("sikfaan");
    expect(stripTones("sik6 faan6")).toBe("sik faan");
  });
});
