// Definitions (words.hk yue, MoE zho) and examples. Rows are copied from the pinned sources
// (some dump examples trimmed).
import { isReadingCrossReference, merge } from "../src/merge/merge";
import type { MoeEntry, WordshkEntry } from "../src/sources/types";
import { inputs } from "./mergeInputs";

const RIME_CHAR_MOU = { char: "冇", jyutping: "mou5", rank: "default" as const };

/** words.hk 13549 (冇, 動詞), first example of each sense only. */
const DUMP_MOU_VERB: WordshkEntry = {
  id: 13549,
  headwords: [{ word: "冇", syllables: ["mou5"] }],
  variants: [],
  pos: ["動詞"],
  labels: [],
  senses: [
    {
      yue: "用喺動詞或者形容詞之前，表示某行為或者效果未喺一個時間點發生、出現",
      examples: [{ yue: "好耐冇見。", jyutping: ["hou2", "noi6", "mou5", "gin3"] }],
    },
    { yue: "「有」嘅相反；表示賓語指涉嘅概念唔存在或者同主題無關", examples: [{ yue: "冇可能", jyutping: ["mou5", "ho2", "nang4"] }] },
    { yue: "未曾或者唔再擁有", examples: [{ yue: "佢冇晒錢嘞。", jyutping: ["keoi5", "mou5", "saai3", "cin2", "laak3"] }] },
  ],
};

/** words.hk 104214 (冇, 語句), first example only. */
const DUMP_MOU_PHRASE: WordshkEntry = {
  id: 104214,
  headwords: [{ word: "冇", syllables: ["mou5"] }],
  variants: [],
  pos: ["語句"],
  labels: [],
  senses: [
    {
      yue: "喺回應中，表示冇乜嘢、只係小事，平常、輕鬆過對方所設想",
      examples: [{ yue: "冇，想問你食咗飯未喳嘛。", jyutping: ["mou5", "soeng2", "man6", "nei5", "sik6", "zo2", "faan6", "mei6", "zaa1", "maa3"] }],
    },
  ],
};

/** words.hk 87701 (這裏), first example only: it has a zho line. */
const DUMP_ZE_LEOI: WordshkEntry = {
  id: 87701,
  headwords: [
    { word: "這裏", syllables: ["ze2", "leoi5"] },
    { word: "這裏", syllables: ["ze5", "leoi5"] },
  ],
  variants: ["這裡"],
  pos: ["代詞"],
  labels: ["書面語"],
  senses: [
    {
      yue: "指稱地理上比較接近或者心理上覺得親近嘅地方；即係呢度",
      examples: [
        {
          yue: "住呢度要每個月俾三萬蚊租。",
          zho: "住在這裏要每個月繳三萬元租金。",
          jyutping: ["zyu6", "ni1", "dou6", "jiu3", "mui5", "go3", "jyut6", "bei2", "saam1", "maan6", "man1", "zou1"],
        },
      ],
    },
  ],
};

/** words.hk 117025 (rapper): loan syllables in the headword and the example. */
const DUMP_RAPPER: WordshkEntry = {
  id: 117025,
  headwords: [{ word: "rapper", syllables: ["rep1", "paa4"], loanSyllables: [0] }],
  variants: [],
  pos: ["名詞"],
  labels: ["外來語"],
  senses: [
    {
      yue: "表演rap嘅人（量詞：個／名）",
      examples: [
        {
          yue: "香港rapper男女比例懸殊。",
          jyutping: ["hoeng1", "gong2", "rep1", "paa4", "naam4", "neoi5", "bei2", "lai6", "jyun4", "syu4"],
          loanSyllables: [2],
        },
      ],
    },
  ],
};

/** words.hk 40639 (不振): two parts of speech. */
const DUMP_BAT_ZAN: WordshkEntry = {
  id: 40639,
  headwords: [{ word: "不振", syllables: ["bat1", "zan3"] }],
  variants: [],
  pos: ["動詞", "形容詞"],
  labels: [],
  senses: [{ yue: "唔振作，唔興旺，頹廢。", examples: [] }],
};

const MOE_ZE_LEOI: MoeEntry = {
  word: "這裡",
  senses: [
    { heteronym: 0, def: "這個地方。表示比較靠近說話者的地方。" },
    { heteronym: 0, def: "這個段落、程度。" },
  ],
};

const MOE_NGO: MoeEntry = {
  word: "我",
  senses: [
    { heteronym: 0, def: "(一)之讀音。" },
    { heteronym: 1, pos: "代", def: "自稱。" },
    { heteronym: 1, pos: "代", def: "自稱己方。" },
    { heteronym: 1, pos: "形", def: "表示親切之意的語詞。" },
    { heteronym: 1, pos: "名", def: "私心、私意。" },
    { heteronym: 1, pos: "名", def: "姓。如戰國時有我子。" },
  ],
};

describe("merge: words.hk definitions and examples", () => {
  const result = merge(inputs({ rimeChars: [RIME_CHAR_MOU], wordshkDump: [DUMP_MOU_PHRASE, DUMP_MOU_VERB] }));
  const mou = result.entries[0];

  it("puts words.hk senses in yue (with a simplified copy), numbered 1-based across the entry's dump entries in id order", () => {
    expect(mou.definitions).toEqual([
      {
        sense: 1,
        pos: "動詞",
        yue: "用喺動詞或者形容詞之前，表示某行為或者效果未喺一個時間點發生、出現",
        yueSimp: "用喺动词或者形容词之前，表示某行为或者效果未喺一个时间点发生、出现",
        source: "wordshk-dump",
      },
      { sense: 2, pos: "動詞", yue: "「有」嘅相反；表示賓語指涉嘅概念唔存在或者同主題無關", yueSimp: "「有」嘅相反；表示宾语指涉嘅概念唔存在或者同主题无关", source: "wordshk-dump" },
      { sense: 3, pos: "動詞", yue: "未曾或者唔再擁有", yueSimp: "未曾或者唔再拥有", source: "wordshk-dump" },
      { sense: 4, pos: "語句", yue: "喺回應中，表示冇乜嘢、只係小事，平常、輕鬆過對方所設想", yueSimp: "喺回应中，表示冇乜嘢、只係小事，平常、轻松过对方所设想", source: "wordshk-dump" },
    ]);
  });

  it("attaches examples to their sense, with simplified text and Jyutping", () => {
    expect(mou.examples).toEqual([
      { sense: 1, yueTrad: "好耐冇見。", yueSimp: "好耐冇见。", jyutping: "hou2 noi6 mou5 gin3", source: "wordshk-dump" },
      { sense: 2, yueTrad: "冇可能", yueSimp: "冇可能", jyutping: "mou5 ho2 nang4", source: "wordshk-dump" },
      { sense: 3, yueTrad: "佢冇晒錢嘞。", yueSimp: "佢冇晒钱嘞。", jyutping: "keoi5 mou5 saai3 cin2 laak3", source: "wordshk-dump" },
      { sense: 4, yueTrad: "冇，想問你食咗飯未喳嘛。", yueSimp: "冇，想问你食咗饭未喳嘛。", jyutping: "mou5 soeng2 man6 nei5 sik6 zo2 faan6 mei6 zaa1 maa3", source: "wordshk-dump" },
    ]);
    expect(result.stats.rows.definitions).toEqual({ "wordshk-dump": 4 });
    expect(result.stats.rows.examples).toEqual({ "wordshk-dump": 4 });
  });

  it("keeps an example's Mandarin line with a simplified copy, and its loan syllables", () => {
    const r = merge(inputs({ wordshkDump: [DUMP_ZE_LEOI, DUMP_RAPPER] }));
    const byTrad = Object.fromEntries(r.entries.map((e) => [e.trad, e]));
    expect(byTrad["這裏"].examples[0]).toMatchObject({ zho: "住在這裏要每個月繳三萬元租金。", zhoSimp: "住在这里要每个月缴三万元租金。" });
    expect(byTrad["rapper"].examples[0]).toMatchObject({ jyutping: "hoeng1 gong2 rep1 paa4 naam4 neoi5 bei2 lai6 jyun4 syu4", loan: [2] });
  });

  it("joins several parts of speech with 、 (不振: 動詞、形容詞)", () => {
    const r = merge(inputs({ wordshkDump: [DUMP_BAT_ZAN] }));
    expect(r.entries[0].definitions[0].pos).toBe("動詞、形容詞");
  });

  it("gives every headword of a dump entry its senses (喺 entry 49899 also lists 響)", () => {
    const r = merge(
      inputs({
        wordshkDump: [
          {
            id: 49899,
            headwords: [
              { word: "喺", syllables: ["hai2"] },
              { word: "响", syllables: ["hoeng2"] },
              { word: "響", syllables: ["hoeng2"] },
            ],
            variants: [],
            pos: ["介詞"],
            labels: [],
            senses: [{ yue: "於；用嚟帶出事件嘅地點、時間", examples: [] }],
          },
        ],
      }),
    );
    expect(r.entries.map((e) => [e.trad, e.definitions.map((d) => d.yue)])).toEqual([
      ["响", ["於；用嚟帶出事件嘅地點、時間"]],
      ["喺", ["於；用嚟帶出事件嘅地點、時間"]],
      ["響", ["於；用嚟帶出事件嘅地點、時間"]],
    ]);
  });

  it("runs without the optional words.hk dump: no definitions or examples from it, listed as omitted", () => {
    const r = merge(inputs({ rimeChars: [RIME_CHAR_MOU], wordshkDump: undefined }));
    expect(r.stats.omitted).toEqual(["wordshk-dump"]);
    expect(r.entries[0]).toMatchObject({ definitions: [], examples: [] });
    expect(merge(inputs()).stats.omitted).toEqual([]);
  });
});

describe("merge: MoE definitions", () => {
  it("puts MoE senses in zho verbatim with a simplified copy, attached through the normalized key (這裡 → 這裏)", () => {
    const r = merge(inputs({ rimeWords: [{ word: "這裏", syllables: ["ze2", "leoi5"] }], moe: [MOE_ZE_LEOI] }));
    expect(r.entries[0]).toMatchObject({ trad: "這裏", aliases: ["這裡"] });
    expect(r.entries[0].definitions).toEqual([
      { sense: 1, zho: "這個地方。表示比較靠近說話者的地方。", zhoSimp: "这个地方。表示比较靠近说话者的地方。", source: "moe" },
      { sense: 2, zho: "這個段落、程度。", zhoSimp: "这个段落、程度。", source: "moe" },
    ]);
  });

  it("takes pos from the MoE sense and drops reading cross-references (我: (一)之讀音。)", () => {
    const r = merge(inputs({ rimeChars: [{ char: "我", jyutping: "ngo5", rank: "default" }], moe: [MOE_NGO] }));
    expect(r.entries[0].definitions.map((d) => [d.sense, d.pos, d.zho])).toEqual([
      [1, "代", "自稱。"],
      [2, "代", "自稱己方。"],
      [3, "形", "表示親切之意的語詞。"],
      [4, "名", "私心、私意。"],
      [5, "名", "姓。如戰國時有我子。"],
    ]);
    expect(r.stats.moe).toMatchObject({ sensesDropped: 1, droppedSample: [{ word: "我", def: "(一)之讀音。" }] });
  });

  it("puts words.hk definitions before MoE ones, each numbered from 1", () => {
    const r = merge(inputs({ wordshkDump: [DUMP_ZE_LEOI], moe: [MOE_ZE_LEOI] }));
    expect(r.entries[0].definitions.map((d) => [d.source, d.sense])).toEqual([
      ["wordshk-dump", 1],
      ["moe", 1],
      ["moe", 2],
    ]);
  });

  it("attaches one MoE entry per key, preferring the displayed spelling (剛才 over 剛纔)", () => {
    const r = merge(
      inputs({
        rimeWords: [{ word: "剛纔", syllables: ["gong1", "coi4"] }],
        wordshkList: [{ word: "剛才", syllables: ["gong1", "coi4"] }],
        moe: [
          { word: "剛纔", senses: [{ heteronym: 0, def: "僅僅。" }] },
          { word: "剛才", senses: [{ heteronym: 0, def: "不久以前。" }] },
        ],
      }),
    );
    expect(r.entries[0]).toMatchObject({ trad: "剛才", definitions: [{ zho: "不久以前。" }] });
    expect(r.stats.moe.shadowedEntries).toBe(1);
  });

  it("counts MoE headwords with no entry", () => {
    const r = merge(inputs({ moe: [MOE_ZE_LEOI] }));
    expect(r.entries).toEqual([]);
    expect(r.stats.unmatched.moeEntries).toBe(1);
  });
});

describe("isReadingCrossReference", () => {
  it("recognises definitions that only point at another reading", () => {
    expect(isReadingCrossReference("我", "(一)之讀音。")).toBe(true);
    expect(isReadingCrossReference("俱", "(一)之又音。")).toBe(true);
    expect(isReadingCrossReference("們", "(一)之語音。")).toBe(true);
    expect(isReadingCrossReference("薄", "1、2、4的語音。")).toBe(true);
    // A one-character headword's note on its reading inside a word.
    expect(isReadingCrossReference("雙", "雙棒兒的雙的語音。")).toBe(true);
    expect(isReadingCrossReference("廁", "「茅廁」的「廁」的讀音。")).toBe(true);
  });

  it("keeps real definitions that mention 語音/讀音 (口音, 字音, 後人)", () => {
    expect(isReadingCrossReference("口音", "帶有各民族或地方特色的語音。")).toBe(false);
    expect(isReadingCrossReference("字音", "字的讀音。")).toBe(false);
    expect(isReadingCrossReference("後人", "後代的子孫。即(一)1.的語音。")).toBe(false);
    expect(isReadingCrossReference("我", "自稱。")).toBe(false);
  });
});
