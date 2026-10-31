// Word entries: key joining across spellings, the displayed trad, word readings and loan syllables.
// Every row below is copied from the pinned sources.
import { merge } from "../src/merge/merge";
import type { WordshkEntry } from "../src/sources/types";
import { inputs } from "./mergeInputs";

const entryFor = (result: ReturnType<typeof merge>, key: string) => {
  const found = result.entries.find((e) => e.key === key);
  if (found === undefined) throw new Error(`no entry with key ${key}`);
  return found;
};

/** words.hk dump entry 114708 (DSE), senses trimmed: headwords only matter here. */
const DSE_DUMP: WordshkEntry = {
  id: 114708,
  headwords: [
    { word: "DSE", syllables: ["di1", "es1", "ji1"], loanSyllables: [1] },
    { word: "DSE", syllables: ["di1", "e1", "si1"] },
    { word: "DSE", syllables: ["di1", "e1", "si4", "ji1"] },
  ],
  variants: [],
  pos: ["名詞"],
  labels: ["外來語", "香港"],
  senses: [],
};

describe("merge: word entries and key normalization", () => {
  it("merges rime and words.hk keys written in different character forms into one entry", () => {
    // rime writes 衛生 (OpenCC standard), words.hk 衞生 (Hong Kong form).
    const result = merge(
      inputs({
        rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }],
        wordshkList: [{ word: "衞生", syllables: ["wai6", "sang1"] }],
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      trad: "衞生",
      simp: "卫生",
      kind: "word",
      aliases: [{ trad: "衛生", simp: "卫生" }],
      readings: [{ jyutping: "wai6 sang1", source: "rime" }],
    });
    expect(result.stats.keyCollisions).toEqual({ keysWithSeveralSpellings: 1, sample: [{ key: result.entries[0].key, spellings: ["衛生", "衞生"] }] });
  });

  it("joins a word words.hk lists in two forms (着急, 著急) with rime's 着急", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "着急", syllables: ["zoek6", "gap1"] }],
        wordshkList: [
          { word: "着急", syllables: ["zoek6", "gap1"] },
          { word: "著急", syllables: ["zoek6", "gap1"] },
        ],
      }),
    );
    expect(result.entries.map((e) => [e.trad, e.aliases.map((a) => a.trad)])).toEqual([["着急", ["著急"]]]);
  });

  it("displays the words.hk spelling when there is one, else rime's", () => {
    const withWordshk = merge(
      inputs({ rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }], wordshkDump: [{ ...DSE_DUMP, id: 63209, headwords: [{ word: "衞生", syllables: ["wai6", "sang1"] }] }] }),
    );
    expect(withWordshk.entries[0].trad).toBe("衞生");
    const rimeOnly = merge(inputs({ rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }] }));
    expect(rimeOnly.entries[0].trad).toBe("衛生");
  });

  it("takes word readings from rime, then the words.hk list, then dump headwords, de-duplicated by syllables", () => {
    const result = merge(
      inputs({
        rimeWords: [
          { word: "這裏", syllables: ["ze2", "leoi5"] },
          { word: "這裏", syllables: ["ze3", "leoi5"] },
          { word: "這裏", syllables: ["ze5", "leoi5"] },
        ],
        wordshkList: [
          { word: "這裏", syllables: ["ze2", "leoi5"] },
          { word: "這裏", syllables: ["ze5", "leoi5"] },
        ],
      }),
    );
    expect(result.entries[0].readings).toEqual([
      { jyutping: "ze2 leoi5", source: "rime" },
      { jyutping: "ze3 leoi5", source: "rime" },
      { jyutping: "ze5 leoi5", source: "rime" },
    ]);
  });

  it("keeps words.hk loan syllables as `loan` (DSE: es1 is not Jyutping)", () => {
    const result = merge(
      inputs({
        wordshkList: [
          { word: "DSE", syllables: ["di1", "es1", "ji1"], loanSyllables: [1] },
          { word: "DSE", syllables: ["di1", "e1", "si1"] },
        ],
        wordshkDump: [DSE_DUMP],
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ trad: "DSE", simp: "DSE", kind: "word" });
    expect(result.entries[0].readings).toEqual([
      { jyutping: "di1 e1 si1", source: "wordshk-list" },
      { jyutping: "di1 es1 ji1", source: "wordshk-list", loan: [1] },
      { jyutping: "di1 e1 si4 ji1", source: "wordshk-dump" },
    ]);
    expect(result.stats.rows.readings).toEqual({ "wordshk-list": 2, "wordshk-dump": 1 });
  });

  it("folds a one-character words.hk headword into the char entry; a reading rime lacks becomes 'variant' (冇 mou2)", () => {
    const result = merge(
      inputs({
        rimeChars: [
          { char: "冇", jyutping: "mo5", rank: "obsolete" },
          { char: "冇", jyutping: "mou5", rank: "default" },
        ],
        wordshkList: [
          { word: "冇", syllables: ["mou5"] },
          { word: "冇", syllables: ["mou2"] },
        ],
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ trad: "冇", kind: "char" });
    expect(result.entries[0].readings).toEqual([
      { jyutping: "mou5", rank: "default", source: "rime" },
      { jyutping: "mo5", rank: "obsolete", source: "rime" },
      { jyutping: "mou2", rank: "variant", source: "wordshk-list" },
    ]);
  });

  it("makes a one-code-point headword no char source has a char entry with unranked readings (D)", () => {
    const result = merge(inputs({ wordshkList: [{ word: "D", syllables: ["di1"] }] }));
    expect(result.entries).toEqual([
      expect.objectContaining({ trad: "D", kind: "char", readings: [{ jyutping: "di1", source: "wordshk-list" }] }),
    ]);
  });

  it("never creates an entry from a words.hk variantForm row (麵包*, 㨂*)", () => {
    const result = merge(
      inputs({
        wordshkList: [
          { word: "麵包", syllables: ["min6", "baau1"], variantForm: true },
          { word: "㨂", syllables: ["gaan2"], variantForm: true },
        ],
      }),
    );
    expect(result.entries).toEqual([]);
  });

  it("counts entries by kind", () => {
    const result = merge(
      inputs({
        rimeChars: [{ char: "揀", jyutping: "gaan2", rank: "default" }],
        rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }],
        wordshkDump: [DSE_DUMP],
      }),
    );
    expect(result.stats.entries).toEqual({ char: 1, word: 2 });
    expect(entryFor(result, "DSE").kind).toBe("word");
  });
});
