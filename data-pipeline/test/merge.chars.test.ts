// Character entries and their readings. Every row below is copied from the pinned sources.
import { merge } from "../src/merge/merge";
import type { CharReading } from "../src/sources/types";
import { inputs } from "./mergeInputs";

const entryFor = (result: ReturnType<typeof merge>, trad: string) => {
  const found = result.entries.find((e) => e.trad === trad);
  if (found === undefined) throw new Error(`no entry ${trad}`);
  return found;
};

// rime char.csv
const RIME_CHARS: CharReading[] = [
  { char: "五", jyutping: "ng5", rank: "default" },
  { char: "你", jyutping: "nei5", rank: "default" },
  { char: "我", jyutping: "ngo5", rank: "default" },
  // 行 is one of the 60 characters with no 預設 (default) reading.
  { char: "行", jyutping: "haang4", rank: "common" },
  { char: "行", jyutping: "hang4", rank: "common" },
  { char: "行", jyutping: "hang6", rank: "common" },
  { char: "行", jyutping: "hong2", rank: "rare" },
  { char: "行", jyutping: "hong4", rank: "common" },
  { char: "行", jyutping: "hong6", rank: "obsolete" },
];

// LSHK list.tsv
const LSHK: CharReading[] = [
  { char: "五", jyutping: "ng5" },
  { char: "五", jyutping: "m5" },
  { char: "你", jyutping: "nei5" },
  { char: "你", jyutping: "lei5" },
  { char: "我", jyutping: "ngo5" },
  { char: "我", jyutping: "o5" },
  { char: "㐷", jyutping: "maa6" },
  { char: "㐷", jyutping: "maa3" },
];

// Unihan kCantonese
const UNIHAN: CharReading[] = [
  { char: "五", jyutping: "ng5" },
  { char: "你", jyutping: "nei5" },
  { char: "我", jyutping: "ngo5" },
  { char: "㐷", jyutping: "maa6" },
  { char: "䶸", jyutping: "mo1" },
];

const result = merge(inputs({ rimeChars: RIME_CHARS, lshk: LSHK, unihan: UNIHAN }));

describe("merge: character entries", () => {
  it("creates one char entry per character in the union of rime, LSHK and Unihan, sorted by key", () => {
    expect(result.entries.map((e) => [e.trad, e.kind])).toEqual(
      ["㐷", "䶸", "五", "你", "我", "行"].map((c) => [c, "char"]),
    );
    expect(result.stats.entries).toEqual({ char: 6, word: 0 });
  });

  it("ranks an LSHK reading rime lacks as 'variant', never default (五 m5, 你 lei5, 我 o5)", () => {
    expect(entryFor(result, "五").readings).toEqual([
      { jyutping: "ng5", rank: "default", source: "rime" },
      { jyutping: "m5", rank: "variant", source: "lshk" },
    ]);
    expect(entryFor(result, "你").readings).toEqual([
      { jyutping: "nei5", rank: "default", source: "rime" },
      { jyutping: "lei5", rank: "variant", source: "lshk" },
    ]);
    expect(entryFor(result, "我").readings).toEqual([
      { jyutping: "ngo5", rank: "default", source: "rime" },
      { jyutping: "o5", rank: "variant", source: "lshk" },
    ]);
  });

  it("ranks a Unihan reading rime lacks as 'variant' too", () => {
    const r = merge(inputs({ rimeChars: [{ char: "五", jyutping: "ng5", rank: "default" }], unihan: [{ char: "五", jyutping: "m5" }] }));
    expect(r.entries[0].readings).toEqual([
      { jyutping: "ng5", rank: "default", source: "rime" },
      { jyutping: "m5", rank: "variant", source: "unihan" },
    ]);
  });

  it("keeps every reading of a char with no default reading (行), with rime's ranks, defaults first then by rank", () => {
    expect(entryFor(result, "行").readings).toEqual([
      { jyutping: "haang4", rank: "common", source: "rime" },
      { jyutping: "hang4", rank: "common", source: "rime" },
      { jyutping: "hang6", rank: "common", source: "rime" },
      { jyutping: "hong4", rank: "common", source: "rime" },
      { jyutping: "hong2", rank: "rare", source: "rime" },
      { jyutping: "hong6", rank: "obsolete", source: "rime" },
    ]);
  });

  it("leaves readings of a char rime lacks unranked: LSHK first, then Unihan, never a default", () => {
    expect(entryFor(result, "㐷").readings).toEqual([
      { jyutping: "maa3", source: "lshk" },
      { jyutping: "maa6", source: "lshk" },
    ]);
    expect(entryFor(result, "䶸").readings).toEqual([{ jyutping: "mo1", source: "unihan" }]);
  });

  it("de-duplicates readings by Jyutping; the kept row carries the highest-priority source", () => {
    // ng5 is in all three sources; 㐷 maa6 in LSHK and Unihan.
    expect(entryFor(result, "五").readings.filter((r) => r.jyutping === "ng5")).toEqual([{ jyutping: "ng5", rank: "default", source: "rime" }]);
    expect(entryFor(result, "㐷").readings.filter((r) => r.jyutping === "maa6")).toEqual([{ jyutping: "maa6", source: "lshk" }]);
    expect(result.stats.rows.readings).toEqual({ rime: 9, lshk: 5, unihan: 1 });
  });

  it("gives every char a simplified form and no aliases", () => {
    expect(entryFor(result, "行")).toMatchObject({ key: "行", simp: "行", aliases: [] });
  });
});
