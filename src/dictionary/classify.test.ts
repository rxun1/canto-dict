import { classify, MAX_QUERY_LENGTH } from "./classify";

// Spec §5.1: one block per table row, plus the pasted-form, truncation and empty-input rules.
describe("classify", () => {
  describe("contains CJK → hanzi", () => {
    it.each([
      ["食", "食"],
      ["食飯", "食飯"],
      ["饭", "饭"],
      ["𠝹", "𠝹"], // CJK Extension B (a surrogate pair in UTF-16)
      ["食 sik", "食sik"],
      [" 食 飯 ", "食飯"],
      ["AA制", "AA制"],
      ["ＡＡ制", "AA制"], // full-width folded by NFKC
    ])("%j → hanzi %j", (input, text) => {
      expect(classify(input)).toEqual({ kind: "hanzi", text });
    });
  });

  describe("Latin with tone digits that splits into Jyutping → jyutping", () => {
    it.each([
      ["sik6", ["sik6"]],
      ["sik6 faan6", ["sik6", "faan6"]],
      ["sik6faan6", ["sik6", "faan6"]],
      ["SIK6 Faan6", ["sik6", "faan6"]],
      ["  sik6   faan6 ", ["sik6", "faan6"]],
      // partly toned: still Jyutping, not toneless (search uses the joined keys)
      ["sikfaan6", ["sik", "faan6"]],
    ])("%j → %j", (input, syllables) => {
      expect(classify(input)).toEqual({ kind: "jyutping", syllables, key: syllables.join(""), toneless: false });
    });
  });

  describe("Latin without digits that splits into Jyutping → jyutping (toneless)", () => {
    it.each([
      ["sik", ["sik"]],
      ["sikfaan", ["sik", "faan"]],
      ["sin", ["sin"]],
      ["Sik Faan", ["sik", "faan"]],
    ])("%j → %j", (input, syllables) => {
      expect(classify(input)).toEqual({ kind: "jyutping", syllables, key: syllables.join(""), toneless: true });
    });
  });

  describe("pasted forms → jyutping", () => {
    it.each([
      ["nei5-hou2", ["nei5", "hou2"]],
      ["nei5'hou2", ["nei5", "hou2"]],
      ["nei5 - hou2", ["nei5", "hou2"]],
      ["sik 6", ["sik6"]],
      ["sik 6 faan 6", ["sik6", "faan6"]],
      ["nei 5-hou 2", ["nei5", "hou2"]],
      ["nei5‘hou2", ["nei5", "hou2"]],
      ["nei5’hou2", ["nei5", "hou2"]],
      ["sik–6", ["sik6"]], // en dash
      ["ｓｉｋ６", ["sik6"]], // full-width folded by NFKC
    ])("%j → %j", (input, syllables) => {
      expect(classify(input)).toEqual({ kind: "jyutping", syllables, key: syllables.join(""), toneless: false });
    });
  });

  describe("any other Latin text → none (not searchable)", () => {
    it.each(["water", "sik7", "sik0", "6", "6 sik", "sik 66", "sik6!", "xyz", "-", "'"])("%j → none", (input) => {
      expect(classify(input)).toEqual({ kind: "none" });
    });
  });

  describe("empty input → empty (no query, no hint)", () => {
    it.each(["", "   ", "\t\n"])("%j → empty", (input) => {
      expect(classify(input)).toEqual({ kind: "empty" });
    });
  });

  describe(`input longer than ${MAX_QUERY_LENGTH} characters is truncated`, () => {
    it("is 50", () => {
      expect(MAX_QUERY_LENGTH).toBe(50);
    });
    it("truncates Jyutping", () => {
      // 15 x "sik6" is 60 characters; the first 50 are 12 x "sik6" + "si".
      const syllables = [...Array(12).fill("sik6"), "si"];
      expect(classify("sik6".repeat(15))).toEqual({ kind: "jyutping", syllables, key: syllables.join(""), toneless: false });
    });
    it("truncates characters by code point, not UTF-16 unit", () => {
      expect(classify("𠝹".repeat(MAX_QUERY_LENGTH + 10))).toEqual({ kind: "hanzi", text: "𠝹".repeat(MAX_QUERY_LENGTH) });
    });
    it("counts after trimming leading whitespace", () => {
      expect(classify(" ".repeat(10) + "食".repeat(MAX_QUERY_LENGTH))).toEqual({ kind: "hanzi", text: "食".repeat(MAX_QUERY_LENGTH) });
    });
    it("leaves input at the limit alone", () => {
      expect(classify("食".repeat(MAX_QUERY_LENGTH))).toEqual({ kind: "hanzi", text: "食".repeat(MAX_QUERY_LENGTH) });
    });
  });
});
