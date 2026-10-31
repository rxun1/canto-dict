// The simplified keep-list: characters toSimplified leaves unchanged after OpenCC.
import OpenCC from "opencc-js";
import { merge } from "../src/merge/merge";
import { toSimplified } from "../src/merge/normalize";
import { CANTONESE_KEEP, NON_BMP_KEEP, XI_HEADWORDS, XI_TEXT_PHRASES } from "../src/merge/simplifiedKeep";
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
    expect(toSimplified("佢係我", "yue")).toBe("佢係我");
    expect(toSimplified("嗰度", "yue")).toBe("嗰度");
    expect(toSimplified("買餸", "yue")).toBe("买餸");
    // Only the listed character is kept; its neighbours still convert.
    expect(toSimplified("佢係學生", "yue")).toBe("佢係学生");
  });

  it("converts 係 as usual in Mandarin text, Taiwan or Hong Kong forms (我們的關係很好 → 我们的关系很好)", () => {
    expect(toSimplified("關係", "zho-tw")).toBe("关系");
    expect(toSimplified("我們的關係很好", "zho-hk")).toBe("我们的关系很好");
  });

  it("gives a words.hk example's Mandarin translation no Cantonese keep (words.hk 96774 教會)", () => {
    const result = merge(
      inputs({
        wordshkDump: [
          {
            id: 96774,
            headwords: [{ word: "教會", syllables: ["gaau3", "wui5"] }],
            variants: ["敎會"],
            pos: ["動詞"],
            labels: ["書面語"],
            senses: [
              {
                yue: "教人學識一啲嘢",
                examples: [
                  {
                    yue: "全靠你教識咗我點樣處理工作上嘅人際關係。",
                    zho: "全靠您教會了我怎樣處理工作上的人際關係。",
                    jyutping: ["cyun4", "kaau3", "nei5", "gaau3", "sik1", "zo2", "ngo5", "dim2", "joeng6", "cyu5", "lei5", "gung1", "zok3", "soeng6", "ge3", "jan4", "zai3", "gwaan1", "hai6"],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result.entries[0].examples[0].zhoSimp).toBe("全靠您教会了我怎样处理工作上的人际关系。");
  });

  it("keeps non-BMP forms in Hong Kong-form Mandarin text too", () => {
    expect(toSimplified("鮟鱇魚", "zho-hk")).toBe("鮟鱇鱼");
  });

  it("keeps characters whose simplified form is outside the BMP, in both scripts (鮟鱇, not 𩽾𩾌)", () => {
    expect(OpenCC.Converter({ from: "hk", to: "cn" })("鮟鱇")).toBe("𩽾𩾌");
    expect(toSimplified("鮟鱇魚", "yue")).toBe("鮟鱇鱼");
    expect(toSimplified("鮟鱇魚", "zho-tw")).toBe("鮟鱇鱼");
  });

  it("still converts everything else (嘅/冇/喺 have no simplified form anyway)", () => {
    expect(toSimplified("冇問題嘅", "yue")).toBe("冇问题嘅");
    expect(toSimplified("喺學校", "yue")).toBe("喺学校");
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
    expect(result.stats.simplifiedKeep).toMatchObject({ cantonese: CANTONESE_KEEP, nonBmp: NON_BMP_KEEP });
  });

  it("applies to merged headwords (嗰度 stays 嗰度)", () => {
    const result = merge(inputs({ rimeWords: [{ word: "嗰度", syllables: ["go2", "dou6"] }] }));
    expect(result.entries[0]).toMatchObject({ trad: "嗰度", simp: "嗰度" });
  });
});

describe("toSimplified 係 phrases (Mandarin-origin words where 係 still becomes 系)", () => {
  it("converts 關係 anywhere in Cantonese text (關係 → 关系, 冇關係 → 冇关系)", () => {
    expect(toSimplified("關係", "yue")).toBe("关系");
    expect(toSimplified("冇關係", "yue")).toBe("冇关系");
    expect(toSimplified("佢哋嘅關係係好好", "yue")).toBe("佢哋嘅关系係好好");
    expect(toSimplified("冇關係", "headword")).toBe("冇关系");
  });

  it("keeps the copula 係 that happens to precede 數 (佢係數學老師)", () => {
    expect(toSimplified("佢係數學老師", "yue")).toBe("佢係数学老师");
    expect(toSimplified("佢係我", "yue")).toBe("佢係我");
    expect(toSimplified("佢係我", "headword")).toBe("佢係我");
  });

  it("converts the checked headwords only as whole headwords (基尼係數 → 基尼系数)", () => {
    expect(toSimplified("基尼係數", "headword")).toBe("基尼系数");
    expect(toSimplified("係數", "headword")).toBe("系数");
    expect(toSimplified("介係詞", "headword")).toBe("介系词");
    // In running text 係數 is not matched.
    expect(toSimplified("基尼係數", "yue")).toBe("基尼係数");
  });

  it("lists the phrases with how often merge applied them, next to the keep-list", () => {
    const result = merge(
      inputs({
        rimeWords: [
          { word: "關係", syllables: ["gwaan1", "hai6"] },
          { word: "基尼係數", syllables: ["gei1", "nei4", "hai6", "sou3"] },
          { word: "佢係我", syllables: ["keoi5", "hai6", "ngo5"] },
        ],
      }),
    );
    expect(result.entries.map((e) => [e.trad, e.simp])).toEqual([
      ["佢係我", "佢係我"],
      ["基尼係數", "基尼系数"],
      ["關係", "关系"],
    ]);
    const counts = Object.fromEntries(result.stats.simplifiedKeep.xiPhrases.map(({ word, count }) => [word, count]));
    expect(counts).toMatchObject({ 關係: 1, 基尼係數: 1, 係數: 0 });
    expect(result.stats.simplifiedKeep.xiPhrases.map((p) => p.word)).toEqual([...XI_TEXT_PHRASES, ...XI_HEADWORDS]);
  });
});
