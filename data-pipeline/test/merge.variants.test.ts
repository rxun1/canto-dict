// words.hk variant forms (異體字) fold into their standard entry as aliases, through the variant links
// of public words.hk dump entries. Rows are copied from the pinned sources (senses trimmed).
import { merge } from "../src/merge/merge";
import type { WordshkEntry } from "../src/sources/types";
import { inputs } from "./mergeInputs";

const dumpEntry = (id: number, words: [string, string[]][], variants: string[]): WordshkEntry => ({
  id,
  headwords: words.map(([word, syllables]) => ({ word, syllables })),
  variants,
  pos: [],
  labels: [],
  senses: [],
});

/** words.hk 72250: 揀, variants 㨂. */
const DUMP_GAAN = dumpEntry(72250, [["揀", ["gaan2"]]], ["㨂"]);
const LIST_GAAN = [
  { word: "㨂", syllables: ["gaan2"], variantForm: true as const },
  { word: "揀", syllables: ["gaan2"] },
];

describe("merge: words.hk variant forms", () => {
  it("folds a linked variantForm row into its standard entry as an alias, never a headword (㨂 → 揀)", () => {
    const result = merge(inputs({ wordshkList: LIST_GAAN, wordshkDump: [DUMP_GAAN] }));
    expect(result.entries.map((e) => [e.trad, e.aliases])).toEqual([["揀", ["㨂"]]]);
    expect(result.stats.variants).toEqual({
      listRows: 1,
      listWords: 1,
      linkedWords: 1,
      droppedRows: 0,
      droppedWords: 0,
      droppedButKeyMatched: 0,
      aliasesFromLinks: 1,
    });
  });

  it("does not fold 異體字 through OpenCC: without the dump link, 㨂 is dropped and counted", () => {
    const result = merge(inputs({ wordshkList: LIST_GAAN, wordshkDump: undefined }));
    expect(result.entries.map((e) => [e.trad, e.aliases])).toEqual([["揀", []]]);
    expect(result.stats.variants).toMatchObject({ linkedWords: 0, droppedRows: 1, droppedWords: 1, droppedButKeyMatched: 0 });
  });

  it("counts dropped variant rows whose spelling still reaches an entry through the normalized key (麵包* → 麪包)", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "麪包", syllables: ["min6", "baau1"] }],
        wordshkList: [
          { word: "麪包", syllables: ["min6", "baau1"] },
          { word: "麵包", syllables: ["min6", "baau1"], variantForm: true },
        ],
      }),
    );
    expect(result.stats.variants).toMatchObject({ listRows: 1, droppedRows: 1, droppedWords: 1, droppedButKeyMatched: 1 });
  });

  it("adds a dump entry's variants as aliases even when the list has no variant row (衞生 → 衛生)", () => {
    const result = merge(inputs({ wordshkDump: [dumpEntry(63209, [["衞生", ["wai6", "sang1"]]], ["衛生"])] }));
    expect(result.entries.map((e) => [e.trad, e.aliases])).toEqual([["衞生", ["衛生"]]]);
  });

  it("does not repeat an alias another source already spells (rime 衛生 + dump variant 衛生)", () => {
    const result = merge(
      inputs({
        rimeWords: [{ word: "衛生", syllables: ["wai6", "sang1"] }],
        wordshkList: [{ word: "衛生", syllables: ["wai6", "sang1"], variantForm: true }],
        wordshkDump: [dumpEntry(63209, [["衞生", ["wai6", "sang1"]]], ["衛生"])],
      }),
    );
    expect(result.entries.map((e) => [e.trad, e.aliases])).toEqual([["衞生", ["衛生"]]]);
  });

  it("gives a variant linked from an entry with two headwords to both entries (爲什麼 → 為什麼, 為甚麼)", () => {
    const result = merge(
      inputs({
        wordshkDump: [
          dumpEntry(
            86778,
            [
              ["為甚麼", ["wai6", "sam6", "mo1"]],
              ["為什麼", ["wai6", "sam6", "mo1"]],
            ],
            ["爲什麼", "爲甚麼"],
          ),
        ],
      }),
    );
    expect(result.entries.map((e) => [e.trad, e.aliases])).toEqual([
      ["為什麼", ["爲什麼", "爲甚麼"]],
      ["為甚麼", ["爲什麼", "爲甚麼"]],
    ]);
  });
});
