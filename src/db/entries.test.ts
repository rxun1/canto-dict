import { getEntry } from "./entries";
import { openTestDb } from "./testDb";

const db = openTestDb();
afterAll(() => db.close());

// Ids are the fixture DB's (assets/test/canto.fixture.db).
describe("getEntry", () => {
  it("returns an entry with its aliases, readings, mandarin, definitions and examples in order", async () => {
    const entry = await getEntry(db, 81);
    expect(entry).toMatchObject({
      id: 81,
      trad: "揀",
      simp: "拣",
      kind: "char",
      freq: 0,
      aliases: [{ trad: "㨂", simp: "㨂" }],
      readings: [{ jyutping: "gaan2", rank: null, source: "wordshk-list", loan: [] }],
      mandarin: [
        { trad: "挑揀", simp: "挑拣", sources: ["wiktionary"] },
        { trad: "挑選", simp: "挑选", sources: ["wiktionary"] },
        { trad: "揀選", simp: "拣选", sources: ["wiktionary"] },
        { trad: "選擇", simp: "选择", sources: ["wiktionary"] },
      ],
      definitions: [
        {
          sense: 1,
          pos: "動詞",
          yue: "喺兩樣以上嘅嘢入面，決定要邊樣",
          yueSimp: "喺两样以上嘅嘢入面，决定要边样",
          zho: null,
          zhoSimp: null,
          source: "wordshk-dump",
        },
      ],
    });
    expect(entry?.examples).toHaveLength(6);
    expect(entry?.examples[0]).toEqual({
      sense: 1,
      yueTrad: "有得揀",
      yueSimp: "有得拣",
      jyutping: "jau5 dak1 gaan2",
      loan: [],
      zho: null,
      zhoSimp: null,
      source: "wordshk-dump",
    });
  });

  it("keeps sense order, example translations and every reading", async () => {
    const entry = await getEntry(db, 43);
    expect(entry?.definitions.map((d) => d.sense)).toEqual([1, 2]);
    expect(entry?.examples[0]).toMatchObject({ yueTrad: "唔使客氣", zho: "不用客氣", zhoSimp: "不用客气" });
    expect((await getEntry(db, 8))?.readings.map((r) => r.jyutping)).toEqual(["zhim1 fong2", "zim1 fong2"]);
  });

  it("splits loan indexes and mandarin sources", async () => {
    expect((await getEntry(db, 5))?.readings).toEqual([
      { jyutping: "di1 e1 si1", rank: null, source: "wordshk-list", loan: [] },
      { jyutping: "di1 es1 ji1", rank: null, source: "wordshk-list", loan: [1] },
    ]);
    expect((await getEntry(db, 9))?.examples[0].loan).toEqual([2]);
    expect((await getEntry(db, 110))?.mandarin[0].sources).toEqual(["kaifangcidian", "wiktionary"]);
  });

  it("returns null for an unknown id", async () => {
    expect(await getEntry(db, 999999)).toBeNull();
  });
});
