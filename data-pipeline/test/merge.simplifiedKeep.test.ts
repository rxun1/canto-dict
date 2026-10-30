// The simplified keep-list: characters toSimplified leaves unchanged after OpenCC.
import OpenCC from "opencc-js";
import { merge } from "../src/merge/merge";
import { toSimplified } from "../src/merge/normalize";
import { CANTONESE_KEEP, NON_BMP_KEEP } from "../src/merge/simplifiedKeep";
import { inputs } from "./mergeInputs";

/** The CJK blocks NON_BMP_KEEP was derived from (see its doc comment). */
const CJK_BLOCKS: readonly [number, number][] = [
  [0x2e80, 0x2fdf],
  [0x3000, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x3347f],
];
const BMP_END = 0xffff;
const byCodePoint = (a: string, b: string): number => a.codePointAt(0)! - b.codePointAt(0)!;

describe("toSimplified keep-list", () => {
  it("keeps the Cantonese characters 係, 嗰 and 餸 in Cantonese text (佢係我, 嗰度, 買餸)", () => {
    expect(toSimplified("佢係我", "hk")).toBe("佢係我");
    expect(toSimplified("嗰度", "hk")).toBe("嗰度");
    expect(toSimplified("買餸", "hk")).toBe("买餸");
    // Only the listed character is kept; its neighbours still convert.
    expect(toSimplified("佢係學生", "hk")).toBe("佢係学生");
  });

  it("converts 係 as usual in Mandarin (Taiwan-script) text: 關係 → 关系", () => {
    expect(toSimplified("關係", "tw")).toBe("关系");
  });

  it("keeps characters whose simplified form is outside the BMP, in both scripts (鮟鱇, not 𩽾𩾌)", () => {
    expect(OpenCC.Converter({ from: "hk", to: "cn" })("鮟鱇")).toBe("𩽾𩾌");
    expect(toSimplified("鮟鱇魚", "hk")).toBe("鮟鱇鱼");
    expect(toSimplified("鮟鱇魚", "tw")).toBe("鮟鱇鱼");
  });

  it("still converts everything else (嘅/冇/喺 have no simplified form anyway)", () => {
    expect(toSimplified("冇問題嘅", "hk")).toBe("冇问题嘅");
    expect(toSimplified("喺學校", "hk")).toBe("喺学校");
  });

  it("is sorted and duplicate-free, CANTONESE_KEEP included", () => {
    for (const list of [CANTONESE_KEEP, NON_BMP_KEEP]) {
      expect([...list].sort(byCodePoint)).toEqual(list);
      expect(new Set(list).size).toBe(list.length);
      for (const char of list) expect([...char]).toHaveLength(1);
    }
  });

  it("NON_BMP_KEEP is every CJK character OpenCC simplifies to a non-BMP form (re-derived here)", () => {
    const converters = [OpenCC.Converter({ from: "hk", to: "cn" }), OpenCC.Converter({ from: "tw", to: "cn" })];
    const derived: string[] = [];
    for (const [first, last] of CJK_BLOCKS) {
      for (let codePoint = first; codePoint <= last; codePoint++) {
        const char = String.fromCodePoint(codePoint);
        const nonBmp = converters.some((convert) => {
          const simp = convert(char);
          return simp !== char && [...simp].some((c) => c.codePointAt(0)! > BMP_END);
        });
        if (nonBmp) derived.push(char);
      }
    }
    expect(NON_BMP_KEEP).toEqual(derived);
  });

  it("is listed in the merge stats for the build report", () => {
    const result = merge(inputs());
    expect(result.stats.simplifiedKeep).toEqual({ cantonese: CANTONESE_KEEP, nonBmp: NON_BMP_KEEP });
  });

  it("applies to merged headwords (嗰度 stays 嗰度)", () => {
    const result = merge(inputs({ rimeWords: [{ word: "嗰度", syllables: ["go2", "dou6"] }] }));
    expect(result.entries[0]).toMatchObject({ trad: "嗰度", simp: "嗰度" });
  });
});
