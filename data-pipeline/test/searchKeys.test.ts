// Search keys (spec §5.1): what a typed Jyutping query is prefix-matched against.
import { MAX_JOINED_SYLLABLES, searchKeys } from "../src/build/searchKeys";

const keysOf = (jyutping: string, type: string) => searchKeys(jyutping).filter((k) => k.type === type).map((k) => k.key);

describe("searchKeys", () => {
  it("gives the toned and toneless keys of a reading without spaces", () => {
    expect(keysOf("sik6 faan6", "toned")).toEqual(["sik6faan6"]);
    expect(keysOf("sik6 faan6", "toneless")).toEqual(["sikfaan"]);
  });

  it("gives joined keys for tones typed on only some syllables", () => {
    // sik6faan (tone on the first syllable only) is left out: a toned query already prefix-matches sik6faan6.
    expect(keysOf("sik6 faan6", "joined")).toEqual(["sikfaan6"]);
    expect(keysOf("sik6 faan6 laa3", "joined").sort()).toEqual(["sik6faanlaa", "sik6faanlaa3", "sikfaan6laa", "sikfaan6laa3", "sikfaanlaa3"]);
  });

  it("gives no joined keys past MAX_JOINED_SYLLABLES syllables", () => {
    expect(MAX_JOINED_SYLLABLES).toBe(3);
    const keys = searchKeys("jat1 go3 jan4 sik6");
    expect(keys.map((k) => k.type)).toEqual(["toned", "toneless"]);
  });

  it("gives a single syllable no joined keys", () => {
    expect(searchKeys("sik6")).toEqual([
      { key: "sik6", type: "toned" },
      { key: "sik", type: "toneless" },
    ]);
  });

  it("orders keys toned, toneless, then joined, and never repeats one", () => {
    const keys = searchKeys("sik6 faan6 laa3");
    expect(keys.slice(0, 2).map((k) => k.type)).toEqual(["toned", "toneless"]);
    expect(new Set(keys.map((k) => `${k.type} ${k.key}`)).size).toBe(keys.length);
    // The same syllable twice still gives distinct joined keys only.
    const repeated = searchKeys("go1 go1");
    expect(new Set(repeated.map((k) => `${k.type} ${k.key}`)).size).toBe(repeated.length);
  });

  it("stops the keys before the first syllable that is not valid Jyutping (a words.hk loan syllable)", () => {
    // DSE di1 es1 ji1 (es1 is a loan): di1 is still a true prefix of the reading; di1ji1 would not be.
    expect(searchKeys("di1 es1 ji1")).toEqual([
      { key: "di1", type: "toned" },
      { key: "di", type: "toneless" },
    ]);
    // F5 ef1 ng5: the loan comes first, so the reading is not searchable by Jyutping.
    expect(searchKeys("ef1 ng5")).toEqual([]);
  });
});
