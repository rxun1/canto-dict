// Mandarin equivalents from Kaifangcidian and (reversed) Wiktionary. Rows are copied from the pinned sources.
import { cleanKfcdItem, isKfcdFragment } from "../src/merge/merge";
import { merge } from "../src/merge/merge";
import type { DialSynPair, KfcdRow } from "../src/sources/types";
import { inputs } from "./mergeInputs";

const KFCD_MOU: KfcdRow = {
  word: "冇",
  wordSimp: "冇",
  syllables: ["mou5"],
  mandarin: [
    { trad: "沒有", simp: "没有" },
    { trad: "沒", simp: "没" },
    { trad: "無", simp: "无" },
  ],
};
const WIKT_MEIYOU: DialSynPair = { mandarin: "沒有", cantonese: [{ form: "冇" }, { form: "冇有" }] };

// Kaifangcidian repeats 行埋 per sense; the second row carries the （婉） annotation.
const KFCD_HAANGMAAI: KfcdRow[] = [
  {
    word: "行埋",
    wordSimp: "行埋",
    syllables: ["haang4", "maai4"],
    mandarin: [
      { trad: "走在一起", simp: "走在一起" },
      { trad: "走到一起", simp: "走到一起" },
      { trad: "走在一塊兒", simp: "走在一块儿" },
    ],
  },
  { word: "行埋", wordSimp: "行埋", syllables: ["haang4", "maai4"], mandarin: [{ trad: "（婉）性交", simp: "（婉）性交" }, { trad: "同房", simp: "同房" }] },
];

const RIME_CHAR_MOU = { char: "冇", jyutping: "mou5", rank: "default" as const };

describe("merge: Mandarin equivalents", () => {
  it("gives 冇 [没有, 没, 无] from Kaifangcidian and Wiktionary, de-duplicated with merged sources", () => {
    const result = merge(inputs({ rimeChars: [RIME_CHAR_MOU], kaifangcidian: [KFCD_MOU], wiktionary: [WIKT_MEIYOU] }));
    expect(result.entries[0].mandarin).toEqual([
      { trad: "沒有", simp: "没有", sources: ["kaifangcidian", "wiktionary"] },
      { trad: "沒", simp: "没", sources: ["kaifangcidian"] },
      { trad: "無", simp: "无", sources: ["kaifangcidian"] },
    ]);
    expect(result.stats.rows.mandarin).toEqual({ kaifangcidian: 3, wiktionary: 1 });
  });

  it("merges Kaifangcidian rows repeated per sense, removing （…） annotations", () => {
    const result = merge(inputs({ rimeWords: [{ word: "行埋", syllables: ["haang4", "maai4"] }], kaifangcidian: KFCD_HAANGMAAI }));
    expect(result.entries[0].mandarin.map((m) => m.simp)).toEqual(["走在一起", "走到一起", "走在一块儿", "性交", "同房"]);
    expect(result.stats.kaifangcidian).toEqual({ annotationsRemoved: 1, emptyItemsDropped: 0, fragmentsDropped: 0 });
  });

  it("cleans Kaifangcidian items: drops （…） annotations and hints, keeps … placeholders", () => {
    expect(cleanKfcdItem("（婉）性交")).toBe("性交");
    expect(cleanKfcdItem("蓋（房子）")).toBe("蓋");
    expect(cleanKfcdItem("騎（自行車等）")).toBe("騎");
    // 兼夾 → 又…又…: the placeholder is the point of the item (a pattern), so it stays.
    expect(cleanKfcdItem("又…又…")).toBe("又…又…");
    expect(cleanKfcdItem("就…吧")).toBe("就…吧");
    expect(cleanKfcdItem("（婉）")).toBe("");
  });

  it("keeps \"…\" patterns whose words carry meaning (又…又…, 就…吧, 不太…) and drops bare one-character fragments (…子, 老…)", () => {
    for (const item of ["又…又…", "就…吧", "在…之間", "時……時……", "不太…", "…不了多少"]) expect(isKfcdFragment(item), item).toBe(false);
    for (const item of ["…子", "…人", "…起", "老…", "就…", "…"]) expect(isKfcdFragment(item), item).toBe(true);
    // Not a pattern at all.
    expect(isKfcdFragment("子")).toBe(false);
  });

  it("drops Kaifangcidian fragments from entries and counts them (佬: 男人, 漢子, …人, …子)", () => {
    const result = merge(
      inputs({
        rimeChars: [{ char: "佬", jyutping: "lou2", rank: "default" }],
        kaifangcidian: [
          {
            word: "佬",
            wordSimp: "佬",
            syllables: ["lou2"],
            mandarin: [
              { trad: "男人", simp: "男人" },
              { trad: "漢子", simp: "汉子" },
              { trad: "…人", simp: "…人" },
              { trad: "…子", simp: "…子" },
            ],
          },
          { word: "兼夾", wordSimp: "兼夹", syllables: ["gim1", "gaap3"], mandarin: [{ trad: "而且", simp: "而且" }, { trad: "又…又…", simp: "又…又…" }] },
        ],
        rimeWords: [{ word: "兼夾", syllables: ["gim1", "gaap3"] }],
      }),
    );
    const byTrad = Object.fromEntries(result.entries.map((e) => [e.trad, e.mandarin.map((m) => m.trad)]));
    expect(byTrad).toEqual({ 佬: ["男人", "漢子"], 兼夾: ["而且", "又…又…"] });
    expect(result.stats.kaifangcidian.fragmentsDropped).toBe(2);
  });

  it("de-duplicates a cleaned Kaifangcidian item against Wiktionary (起: 蓋（房子） and Wiktionary 蓋)", () => {
    const result = merge(
      inputs({
        rimeChars: [{ char: "起", jyutping: "hei2", rank: "default" }],
        kaifangcidian: [{ word: "起", wordSimp: "起", syllables: ["hei2"], mandarin: [{ trad: "興建", simp: "兴建" }, { trad: "蓋（房子）", simp: "盖（房子）" }] }],
        wiktionary: [
          { mandarin: "蓋", cantonese: [{ form: "起" }] },
          { mandarin: "修建", cantonese: [{ form: "起" }] },
          { mandarin: "興建", cantonese: [{ form: "起" }] },
        ],
      }),
    );
    expect(result.entries[0].mandarin).toEqual([
      { trad: "興建", simp: "兴建", sources: ["kaifangcidian", "wiktionary"] },
      { trad: "蓋", simp: "盖", sources: ["kaifangcidian", "wiktionary"] },
      { trad: "修建", simp: "修建", sources: ["wiktionary"] },
    ]);
  });

  it("reverses Wiktionary pairs, deriving simplified with OpenCC from Taiwan forms (著涼 → 着凉)", () => {
    const result = merge(
      inputs({
        rimeWords: [
          { word: "凍嚫", syllables: ["dung3", "can3"] },
          { word: "冷嚫", syllables: ["laang5", "can1"] },
        ],
        wiktionary: [{ mandarin: "著涼", cantonese: [{ form: "冷嚫" }, { form: "凍嚫" }] }],
      }),
    );
    for (const entry of result.entries) expect(entry.mandarin).toEqual([{ trad: "著涼", simp: "着凉", sources: ["wiktionary"] }]);
  });

  it("uses only Wiktionary forms without a usage note, and skips identity pairs", () => {
    const result = merge(
      inputs({
        rimeChars: [
          { char: "嘅", jyutping: "ge3", rank: "default" },
          { char: "你", jyutping: "nei5", rank: "default" },
        ],
        wiktionary: [
          { mandarin: "的", cantonese: [{ form: "嘅", note: "†" }] },
          { mandarin: "你", cantonese: [{ form: "你" }] },
          { mandarin: "您", cantonese: [{ form: "你" }] },
        ],
      }),
    );
    const byTrad = Object.fromEntries(result.entries.map((e) => [e.trad, e.mandarin.map((m) => m.trad)]));
    expect(byTrad).toEqual({ 嘅: [], 你: ["您"] });
    expect(result.stats.wiktionary).toEqual({ notedFormsSkipped: 1, identityPairsSkipped: 1, describedFormsSkipped: 0 });
  });

  it("skips Wiktionary forms written with ideographic description characters (⿰血聿 for 淋巴)", () => {
    const result = merge(
      inputs({
        rimeWords: [
          { word: "淋巴", syllables: ["lam4", "baa1"] },
          { word: "淋巴液", syllables: ["lam4", "baa1", "jik6"] },
        ],
        wiktionary: [
          // The pinned extract's only such pair: the Mandarin word is an unencoded character's description.
          { mandarin: "⿰血聿", cantonese: [{ form: "淋巴" }, { form: "淋巴液" }] },
          // Made up: the same on the Cantonese side.
          { mandarin: "淋巴", cantonese: [{ form: "⿱艹淋" }] },
        ],
      }),
    );
    for (const entry of result.entries) expect(entry.mandarin).toEqual([]);
    expect(result.stats.wiktionary.describedFormsSkipped).toBe(3);
    expect(result.stats.unmatched.wiktionaryForms).toBe(0);
  });

  it("treats a Wiktionary pair as identity when its two sides share a key (著火 → 著火 for the 着火 entry)", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "着火", syllables: ["zoek6", "fo2"] }],
        wiktionary: [
          { mandarin: "著火", cantonese: [{ form: "著火" }, { form: "火燭" }, { form: "老丙" }] },
          { mandarin: "失火", cantonese: [{ form: "著火" }, { form: "火燭" }, { form: "老丙" }] },
        ],
      }),
    );
    expect(result.entries[0]).toMatchObject({ trad: "着火", mandarin: [{ trad: "失火", simp: "失火", sources: ["wiktionary"] }] });
    expect(result.stats.wiktionary.identityPairsSkipped).toBe(1);
  });

  it("attaches through the normalized key (Kaifangcidian 起床 → the 起牀 entry) and never creates entries", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "起牀", syllables: ["hei2", "cong4"] }],
        kaifangcidian: [{ word: "起床", wordSimp: "起床", syllables: ["hei2", "cong4"], mandarin: [{ trad: "起床", simp: "起床" }] }, KFCD_MOU],
        wiktionary: [WIKT_MEIYOU],
        essay: [{ word: "冇", weight: 1759806 }],
      }),
    );
    expect(result.entries.map((e) => [e.trad, e.aliases, e.mandarin.map((m) => m.simp)])).toEqual([["起牀", ["起床"], ["起床"]]]);
    expect(result.stats.unmatched).toMatchObject({
      kaifangcidianRows: 1,
      kaifangcidianWords: 1,
      kaifangcidianFrequent: [{ word: "冇", count: 1759806 }],
      wiktionaryForms: 2,
    });
  });
});
