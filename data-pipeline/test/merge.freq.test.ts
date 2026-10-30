// Entry frequency: log10(1 + weight) from rime's essay-cantonese, plus the hand-curated overrides.
// Rows and weights are copied from the pinned sources.
import { FREQ_OVERRIDES } from "../src/merge/freqOverrides";
import { merge } from "../src/merge/merge";
import { inputs } from "./mergeInputs";

describe("merge: freq", () => {
  it("is log10(1 + weight), looked up by the displayed trad", () => {
    const result = merge(inputs({ rimeChars: [{ char: "揀", jyutping: "gaan2", rank: "default" }], essay: [{ word: "揀", weight: 64248 }] }));
    expect(result.entries[0].freq).toBe(Math.log10(1 + 64248));
    expect(result.stats.freq.entriesWithFreq).toBe(1);
  });

  it("falls back to another source's spelling of the same key (衞生 → the essay's 衛生)", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }],
        wordshkList: [{ word: "衞生", syllables: ["wai6", "sang1"] }],
        essay: [{ word: "衛生", weight: 1423 }],
      }),
    );
    expect(result.entries[0]).toMatchObject({ trad: "衞生", freq: Math.log10(1 + 1423) });
  });

  it("prefers the displayed trad's weight over another spelling's (麪包 3070, not 麵包 22157)", () => {
    const result = merge(
      inputs({
        wordshkList: [{ word: "麪包", syllables: ["min6", "baau1"] }],
        kaifangcidian: [{ word: "麵包", wordSimp: "面包", syllables: ["min6", "baau1"], mandarin: [] }],
        essay: [
          { word: "麪包", weight: 3070 },
          { word: "麵包", weight: 22157 },
        ],
      }),
    );
    expect(result.entries[0].freq).toBe(Math.log10(1 + 3070));
  });

  it("is 0 for a word with no weight, with no 哋→地 fallback (輕輕哋 does not borrow 輕輕地 800)", () => {
    const result = merge(
      inputs({ wordshkList: [{ word: "輕輕哋", syllables: ["heng6", "heng1", "dei2"] }], essay: [{ word: "輕輕地", weight: 800 }] }),
    );
    expect(result.entries[0].freq).toBe(0);
    expect(result.stats.freq.entriesWithFreq).toBe(0);
  });

  it("uses the override table for common words the essay lacks (我哋 = 我地 55260) and reports it", () => {
    const result = merge(
      inputs({ rimeWords: [{ word: "我哋", syllables: ["ngo5", "dei6"] }], essay: [{ word: "我地", weight: 55260 }] }),
    );
    expect(result.entries[0].freq).toBe(Math.log10(1 + 55260));
    expect(result.stats.freq.overridesUsed).toEqual([{ word: "我哋", weight: 55260 }]);
    expect(result.stats.freq.overridesUnused).toEqual(FREQ_OVERRIDES.map((o) => o.word).filter((w) => w !== "我哋").sort());
  });

  it("reports the essay weight an override replaced, so a stale override shows", () => {
    const result = merge(inputs({ rimeWords: [{ word: "我哋", syllables: ["ngo5", "dei6"] }], essay: [{ word: "我哋", weight: 1 }] }));
    expect(result.entries[0].freq).toBe(Math.log10(1 + 55260));
    expect(result.stats.freq.overridesUsed).toEqual([{ word: "我哋", weight: 55260, essayWeight: 1 }]);
  });
});

describe("FREQ_OVERRIDES", () => {
  it("lists each word once, with a positive integer weight", () => {
    expect(new Set(FREQ_OVERRIDES.map((o) => o.word)).size).toBe(FREQ_OVERRIDES.length);
    for (const { weight } of FREQ_OVERRIDES) expect(Number.isInteger(weight) && weight > 0).toBe(true);
  });

  it("includes the plural pronouns the essay spells with 地 (我哋, 佢哋, 你哋)", () => {
    expect(FREQ_OVERRIDES.map((o) => o.word)).toEqual(expect.arrayContaining(["我哋", "佢哋", "你哋"]));
  });
});
