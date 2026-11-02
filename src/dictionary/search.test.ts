import { existsSync } from "fs";
import { searchKeys } from "../../data-pipeline/src/build/searchKeys";
import { FULL_DB_PATH, openSchemaDb, openTestDb } from "../db/testDb";
import type { Db } from "../db/types";
import { classify } from "./classify";
import { MAX_RESULTS, search, type SearchResult } from "./search";

const ids = (results: SearchResult[]) => results.map((r) => r.id);

// Ids are the fixture DB's (assets/test/canto.fixture.db).
describe("search on the fixture DB", () => {
  const db = openTestDb();
  afterAll(() => db.close());

  describe("characters", () => {
    it("ranks the exact entry, then words starting with it, then words containing it", async () => {
      const results = await search(db, "行");
      expect(results.map((r) => [r.trad, r.match])).toEqual([
        ["行", "exact"],
        ["行街", "prefix"],
        ["銀行", "contains"],
      ]);
    });

    it("finds the same entries from simplified and traditional", async () => {
      expect(ids(await search(db, "银行"))).toEqual(ids(await search(db, "銀行")));
      expect(ids(await search(db, "东"))).toEqual([94]);
      expect(ids(await search(db, "東"))).toEqual([94]);
    });

    it("returns the standard entry once for an alias hit", async () => {
      expect(await search(db, "㨂")).toMatchObject([{ id: 81, trad: "揀", match: "exact" }]);
      expect(ids(await search(db, "揀"))).toEqual([81]);
    });

    it("compares Latin letters in a headword case-insensitively", async () => {
      expect(await search(db, "GYM房")).toMatchObject([{ id: 8, trad: "gym房", match: "exact" }]);
    });

    it("returns a row with the first reading and a Mandarin gloss", async () => {
      expect(await search(db, "揀")).toEqual([
        {
          id: 81,
          trad: "揀",
          simp: "拣",
          match: "exact",
          jyutping: "gaan2",
          gloss: { source: "mandarin", trad: "挑揀", simp: "挑拣" },
        },
      ]);
    });
  });

  describe("Jyutping", () => {
    it("matches every tone of a toneless query and shows the matching reading", async () => {
      const results = await search(db, "mong");
      expect(results.map((r) => [r.id, r.match, r.jyutping])).toEqual([
        [30, "exact", "mong5"],
        [116, "exact", "mong5"],
        [121, "exact", "mong1"], // its first reading is mon1
      ]);
    });

    it("prefix-matches a toneless query across tones", async () => {
      const results = await search(db, "aa");
      expect(ids(results)).toEqual(expect.arrayContaining([45, 70, 105])); // aa1 caa1, aa2 baa1, aa3 maa1
      expect(results.every((r) => r.match === "prefix")).toBe(true);
    });

    it("keeps to the typed tone", async () => {
      const results = ids(await search(db, "aa1"));
      expect(results).toContain(45);
      expect(results).not.toContain(70);
      expect(results).not.toContain(105);
    });

    it("matches a partly toned query through the joined keys", async () => {
      expect((await search(db, "aacaa1")).map((r) => [r.id, r.match])).toEqual([
        [45, "exact"],
        [46, "exact"],
        [95, "exact"],
      ]);
    });

    it("judges exactness on the reading, not a truncated search key", async () => {
      // DSE's di1 e1 si1 / di1 es1 ji1 has the key di1 (keys stop at the loan syllable es1).
      const results = await search(db, "di1");
      expect(results[0]).toMatchObject({ id: 74, match: "exact" });
      expect(results.find((r) => r.id === 5)).toMatchObject({ match: "prefix", jyutping: "di1 e1 si1" });
    });

    it("returns an entry once when several readings match", async () => {
      expect((await search(db, "hong")).filter((r) => r.id === 100)).toHaveLength(1); // hong4, hong2, hong6
      expect((await search(db, "hang")).find((r) => r.id === 100)).toMatchObject({ jyutping: "hang4" });
    });
  });

  it("takes a classification as well as text", async () => {
    expect(await search(db, classify("行"))).toEqual(await search(db, "行"));
  });
});

describe("search without a query", () => {
  const unusedDb: Db = { all: jest.fn(), first: jest.fn() };

  it.each(["water", "", "   ", "sikf"])("%j returns [] without querying", async (input) => {
    expect(await search(unusedDb, input)).toEqual([]);
    expect(await search(unusedDb, classify(input))).toEqual([]);
    expect(unusedDb.all).not.toHaveBeenCalled();
    expect(unusedDb.first).not.toHaveBeenCalled();
  });
});

interface Row {
  id: number;
  trad: string;
  simp?: string;
  freq?: number;
  readings?: string[];
  aliases?: string[];
  mandarin?: [trad: string, simp: string][];
  definitions?: { zho?: [string, string]; yue?: [string, string] }[];
}

/** An in-memory DB with canto.db's schema holding these entries, their readings and search keys. */
function schemaDb(rows: Row[]) {
  const db = openSchemaDb();
  const entry = db.raw.prepare("INSERT INTO entries (id, trad, simp, kind, freq) VALUES (?, ?, ?, ?, ?)");
  const alias = db.raw.prepare("INSERT INTO aliases (entry_id, trad, simp) VALUES (?, ?, ?)");
  const reading = db.raw.prepare("INSERT INTO readings (entry_id, jyutping, source) VALUES (?, ?, 'test')");
  const key = db.raw.prepare("INSERT INTO search_keys (key, entry_id, type) VALUES (?, ?, ?)");
  const mandarin = db.raw.prepare("INSERT INTO mandarin (entry_id, word_trad, word_simp, sources) VALUES (?, ?, ?, 'test')");
  const definition = db.raw.prepare(
    "INSERT INTO definitions (entry_id, sense, zho, zho_simp, yue, yue_simp, source) VALUES (?, ?, ?, ?, ?, ?, 'test')",
  );
  for (const row of rows) {
    const trad = Array.from(row.trad);
    entry.run(row.id, row.trad, row.simp ?? row.trad, trad.length === 1 ? "char" : "word", row.freq ?? 0);
    for (const a of row.aliases ?? []) alias.run(row.id, a, a);
    for (const jyutping of row.readings ?? []) {
      reading.run(row.id, jyutping);
      for (const k of searchKeys(jyutping)) key.run(k.key, row.id, k.type);
    }
    for (const [t, s] of row.mandarin ?? []) mandarin.run(row.id, t, s);
    (row.definitions ?? []).forEach((d, i) => definition.run(row.id, i + 1, ...(d.zho ?? [null, null]), ...(d.yue ?? [null, null])));
  }
  return db;
}

describe("ranking", () => {
  it("orders by match quality, then freq, then shorter headword", async () => {
    const db = schemaDb([
      { id: 1, trad: "食水", freq: 9 },
      { id: 2, trad: "水晶燈", freq: 1 },
      { id: 3, trad: "水泥", freq: 1 },
      { id: 4, trad: "水", freq: 0 },
      { id: 5, trad: "水果", freq: 5 },
      { id: 6, trad: "水牛", freq: 1 },
    ]);
    expect(ids(await search(db, "水"))).toEqual([4, 5, 3, 6, 2, 1]);
    db.close();
  });

  it("puts a Jyutping exact match before a more frequent prefix match", async () => {
    const db = schemaDb([
      { id: 1, trad: "水果", freq: 5, readings: ["seoi2 gwo2"] },
      { id: 2, trad: "水", freq: 0, readings: ["seoi2"] },
    ]);
    expect((await search(db, "seoi")).map((r) => [r.id, r.match])).toEqual([
      [2, "exact"],
      [1, "prefix"],
    ]);
    expect(ids(await search(db, "seoi2"))).toEqual([2, 1]);
    db.close();
  });

  it(`caps results at ${MAX_RESULTS}, or at the limit given`, async () => {
    const db = schemaDb(Array.from({ length: MAX_RESULTS + 10 }, (_, i) => ({ id: i + 1, trad: `水${i}` })));
    expect(await search(db, "水")).toHaveLength(MAX_RESULTS);
    expect(ids(await search(db, "水", 3))).toEqual([1, 2, 3]);
    expect(await search(db, "水", -1)).toEqual([]); // a negative SQLite LIMIT would mean no limit
    expect(await search(db, "seoi", -1)).toEqual([]);
    db.close();
  });

  it("shows the reading an exact Jyutping hit matched, before an earlier prefix-matching one", async () => {
    const db = schemaDb([{ id: 1, trad: "啊", readings: ["aa3", "a3"] }]);
    expect(await search(db, "a")).toMatchObject([{ id: 1, match: "exact", jyutping: "a3" }]);
    db.close();
  });

  it("puts the same-case exact match first", async () => {
    const db = schemaDb([
      { id: 1, trad: "aa制", freq: 5 },
      { id: 2, trad: "AA制", freq: 1 },
    ]);
    expect((await search(db, "AA制")).map((r) => [r.id, r.match])).toEqual([
      [2, "exact"],
      [1, "exact"],
    ]);
    expect(ids(await search(db, "aa制"))).toEqual([1, 2]);
    db.close();
  });

  it("counts a same-case alias hit as a same-case exact match", async () => {
    const db = schemaDb([
      { id: 1, trad: "aa制", freq: 5 },
      { id: 2, trad: "甲制", freq: 1, aliases: ["AA制"] },
    ]);
    expect(ids(await search(db, "AA制"))).toEqual([2, 1]);
    db.close();
  });

  it("treats % and _ in the query as text", async () => {
    const db = schemaDb([{ id: 1, trad: "食飯" }]);
    expect(await search(db, "食_")).toEqual([]);
    expect(await search(db, "%飯")).toEqual([]);
    db.close();
  });
});

describe("gloss", () => {
  it("falls back from Mandarin equivalents to the MoE definition to the words.hk explanation", async () => {
    const db = schemaDb([
      { id: 1, trad: "甲", mandarin: [["沒有", "没有"], ["無", "无"]], definitions: [{ zho: ["釋義", "释义"] }] },
      { id: 2, trad: "甲乙", definitions: [{ yue: ["粵語", "粤语"] }, { zho: ["國語", "国语"], yue: ["其他", "其他"] }] },
      { id: 3, trad: "甲乙丙", definitions: [{ yue: ["粵語", "粤语"] }] },
      { id: 4, trad: "甲乙丙丁" },
    ]);
    expect((await search(db, "甲")).map((r) => r.gloss)).toEqual([
      { source: "mandarin", trad: "沒有", simp: "没有" },
      { source: "zho", trad: "國語", simp: "国语" },
      { source: "yue", trad: "粵語", simp: "粤语" },
      null,
    ]);
    db.close();
  });

  it("leaves jyutping null for an entry without readings", async () => {
    const db = schemaDb([{ id: 1, trad: "甲" }]);
    expect(await search(db, "甲")).toMatchObject([{ jyutping: null }]);
    db.close();
  });
});

// DoD: each query under 50 ms on the full canto.db. Skipped when it has not been built
// (npm run data:build in data-pipeline). Checks the fastest of TIMED_RUNS: under parallel Jest another
// worker can stall a single run, but a real slowdown makes every run slow.
const MAX_QUERY_MS = 50;
const TIMED_RUNS = 10;
(existsSync(FULL_DB_PATH) ? describe : describe.skip)("search on the full canto.db", () => {
  const db = openTestDb(FULL_DB_PATH);
  afterAll(() => db.close());

  it.each([
    ["食", "single character"],
    ["食飯", "word"],
    ["一", "contains-heavy common character"],
    ["sik", "toneless"],
    ["m", "toneless, widest prefix"],
    ["sik6 faan6", "toned, multi-syllable"],
    ["sikfaan6", "partly toned"],
  ])(`%j (%s) runs under ${MAX_QUERY_MS} ms`, async (input) => {
    await search(db, input); // warm the page cache and statement compile
    const times: number[] = [];
    for (let i = 0; i < TIMED_RUNS; i++) {
      const start = process.hrtime.bigint();
      await search(db, input);
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    const fastest = Math.min(...times);
    console.log(`search(${JSON.stringify(input)}): fastest of ${TIMED_RUNS} ${fastest.toFixed(1)} ms, slowest ${Math.max(...times).toFixed(1)} ms`);
    expect(fastest).toBeLessThan(MAX_QUERY_MS);
  });

  it("ranks 食, then words starting with 食, then words containing it", async () => {
    const results = await search(db, "食");
    expect(results[0]).toMatchObject({ trad: "食", match: "exact" });
    const order = { exact: 0, prefix: 1, contains: 2 };
    const qualities = results.map((r) => order[r.match]);
    expect(qualities).toEqual([...qualities].sort());
    expect(results).toHaveLength(MAX_RESULTS);
  });

  it("finds the same entries for 饭 and 飯", async () => {
    // canto.db also has a simplified-only char entry 饭 (trad = simp = 饭, from lshk/rime), which
    // 飯 cannot match. Without it, the 饭 results are the start of the 飯 results, in order.
    const stray = await db.first<{ id: number }>("SELECT id FROM entries WHERE trad = '饭' AND simp = '饭'");
    const simp = ids(await search(db, "饭")).filter((id) => id !== stray?.id);
    const trad = ids(await search(db, "飯"));
    expect(simp.length).toBeGreaterThan(0);
    expect(simp).toEqual(trad.slice(0, simp.length));
  });

  it("matches sik in several tones", async () => {
    const tones = new Set((await search(db, "sik")).map((r) => r.jyutping?.match(/^sik(\d)/)?.[1]));
    expect(tones.size).toBeGreaterThanOrEqual(3);
  });
});
