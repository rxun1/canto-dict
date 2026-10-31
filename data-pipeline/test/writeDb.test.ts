// canto.db writer (spec §4.3): schema, row contents, search lookups, and the all-or-nothing build.
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FIXTURE_DB_PATH, writeDb } from "../src/build/writeDb";
import { merge } from "../src/merge/merge";
import type { Entry } from "../src/merge/types";
import { fixtureInputs } from "../src/fixtureInputs";

const FIXTURE_INPUTS = fixtureInputs();

const TABLES = ["aliases", "definitions", "entries", "examples", "mandarin", "readings", "search_keys"];

const SIK: Entry = {
  key: "食",
  trad: "食",
  simp: "食",
  kind: "char",
  freq: 4.5,
  aliases: [],
  readings: [
    { jyutping: "sik6", rank: "default", source: "rime" },
    { jyutping: "zi6", rank: "rare", source: "rime" },
  ],
  mandarin: [],
  definitions: [],
  examples: [],
};

const FAAN: Entry = {
  key: "飯",
  trad: "飯",
  simp: "饭",
  kind: "char",
  freq: 3.2,
  aliases: [],
  readings: [{ jyutping: "faan6", rank: "default", source: "rime" }],
  mandarin: [],
  definitions: [],
  examples: [],
};

const SIK_FAAN: Entry = {
  key: "食飯",
  trad: "食飯",
  simp: "食饭",
  kind: "word",
  freq: 3.9,
  aliases: [{ trad: "喫飯", simp: "吃饭" }],
  readings: [{ jyutping: "sik6 faan6", source: "rime" }],
  mandarin: [{ trad: "吃飯", simp: "吃饭", sources: ["kaifangcidian", "wiktionary"] }],
  definitions: [
    { sense: 1, pos: "動詞", yue: "食嘢；用餐", yueSimp: "食嘢；用餐", source: "wordshk-dump" },
    { sense: 1, pos: "動", zho: "吃飯。", zhoSimp: "吃饭。", source: "moe" },
  ],
  examples: [
    {
      sense: 1,
      yueTrad: "去食飯",
      yueSimp: "去食饭",
      jyutping: "heoi3 sik6 faan6",
      zho: "去吃飯",
      zhoSimp: "去吃饭",
      source: "wordshk-dump",
    },
  ],
};

/** words.hk's DSE: a loan syllable (es1) in a reading and in an example, and an alias. */
const DSE: Entry = {
  key: "DSE",
  trad: "DSE",
  simp: "DSE",
  kind: "word",
  freq: 0,
  aliases: [{ trad: "文憑試", simp: "文凭试" }],
  readings: [{ jyutping: "di1 es1 ji1", source: "wordshk-dump", loan: [1] }],
  mandarin: [],
  definitions: [{ sense: 1, yue: "香港中學文憑試", yueSimp: "香港中学文凭试", source: "wordshk-dump" }],
  examples: [{ sense: 1, yueTrad: "考DSE", yueSimp: "考DSE", jyutping: "haau2 di1 es1 ji1", loan: [2], source: "wordshk-dump" }],
};

const ENTRIES: readonly Entry[] = [SIK, FAAN, SIK_FAAN, DSE];

const tempPath = (name = "canto.db"): string => join(mkdtempSync(join(tmpdir(), "canto-db-")), name);

/** Writes `entries` and opens the result read-only (closed by the caller). */
function build(entries: readonly Entry[] = ENTRIES): Database.Database {
  const path = tempPath();
  writeDb(path, entries);
  return new Database(path, { readonly: true });
}

const tableNames = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);

/** The schema and every row of every table, in rowid order: the database's content, whatever its bytes. */
function dumpTables(db: Database.Database): Record<string, unknown[]> {
  return {
    sqlite_master: db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all(),
    ...Object.fromEntries(tableNames(db).map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()])),
  };
}

describe("writeDb", () => {
  it("creates the seven tables of spec §4.3 and their indexes", () => {
    const db = build();
    expect(tableNames(db)).toEqual(TABLES);
    const indexed = db
      .prepare("SELECT tbl_name AS t, group_concat(name) AS n FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL GROUP BY tbl_name")
      .all() as { t: string; n: string }[];
    const columnsOf = (table: string) =>
      indexed
        .find((r) => r.t === table)!
        .n.split(",")
        .flatMap((name) => (db.pragma(`index_info(${name})`) as { name: string }[]).map((c) => c.name));
    expect(columnsOf("entries").sort()).toEqual(["simp", "trad"]);
    expect(columnsOf("aliases").sort()).toEqual(["entry_id", "simp", "trad"]);
    expect(columnsOf("search_keys").sort()).toEqual(["entry_id", "key"]);
    for (const table of ["readings", "mandarin", "definitions", "examples"]) expect(columnsOf(table)).toEqual(["entry_id"]);
    db.close();
  });

  it("finds 食 by a search_keys prefix (key LIKE 'sik%'), through the index", () => {
    const db = build();
    const sql = "SELECT DISTINCT e.trad FROM search_keys k JOIN entries e ON e.id = k.entry_id WHERE k.key LIKE 'sik%' ORDER BY e.id";
    expect((db.prepare(sql).all() as { trad: string }[]).map((r) => r.trad)).toEqual(["食", "食飯"]);
    const plan = (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((r) => r.detail).join("\n");
    expect(plan).toMatch(/USING (COVERING )?INDEX search_keys_key/);
    db.close();
  });

  it("finds 飯 by its simplified form 饭 in entries.simp", () => {
    const db = build();
    expect(db.prepare("SELECT trad FROM entries WHERE simp = ?").all("饭")).toEqual([{ trad: "飯" }]);
    db.close();
  });

  it("writes entries in the order given with sequential ids", () => {
    const db = build();
    expect(db.prepare("SELECT id, trad, simp, kind, freq FROM entries ORDER BY id").all()).toEqual([
      { id: 1, trad: "食", simp: "食", kind: "char", freq: 4.5 },
      { id: 2, trad: "飯", simp: "饭", kind: "char", freq: 3.2 },
      { id: 3, trad: "食飯", simp: "食饭", kind: "word", freq: 3.9 },
      { id: 4, trad: "DSE", simp: "DSE", kind: "word", freq: 0 },
    ]);
    db.close();
  });

  it("writes each alias with its simplified form", () => {
    const db = build();
    expect(db.prepare("SELECT entry_id, trad, simp FROM aliases ORDER BY rowid").all()).toEqual([
      { entry_id: 3, trad: "喫飯", simp: "吃饭" },
      { entry_id: 4, trad: "文憑試", simp: "文凭试" },
    ]);
    db.close();
  });

  it("writes readings with NULL rank and loan when absent, and loan indexes comma-separated", () => {
    const db = build();
    expect(db.prepare("SELECT entry_id, jyutping, rank, source, loan FROM readings ORDER BY rowid").all()).toEqual([
      { entry_id: 1, jyutping: "sik6", rank: "default", source: "rime", loan: null },
      { entry_id: 1, jyutping: "zi6", rank: "rare", source: "rime", loan: null },
      { entry_id: 2, jyutping: "faan6", rank: "default", source: "rime", loan: null },
      { entry_id: 3, jyutping: "sik6 faan6", rank: null, source: "rime", loan: null },
      { entry_id: 4, jyutping: "di1 es1 ji1", rank: null, source: "wordshk-dump", loan: "1" },
    ]);
    // Several loan indexes join with commas.
    const multi = build([{ ...DSE, readings: [{ jyutping: "ef1 bi1 aai1", source: "wordshk-dump", loan: [0, 2] }] }]);
    expect(multi.prepare("SELECT loan FROM readings").get()).toEqual({ loan: "0,2" });
    multi.close();
    // An empty loan list is NULL too.
    const empty = build([{ ...DSE, readings: [{ jyutping: "di1 e1 si1", source: "wordshk-dump", loan: [] }] }]);
    expect(empty.prepare("SELECT loan FROM readings").get()).toEqual({ loan: null });
    empty.close();
    db.close();
  });

  it("writes Mandarin equivalents with their sources comma-separated in priority order", () => {
    const db = build();
    expect(db.prepare("SELECT * FROM mandarin").all()).toEqual([
      { entry_id: 3, word_trad: "吃飯", word_simp: "吃饭", sources: "kaifangcidian,wiktionary" },
    ]);
    db.close();
  });

  it("writes definitions with traditional and simplified text, NULL where a source has none", () => {
    const db = build();
    expect(db.prepare("SELECT * FROM definitions ORDER BY rowid").all()).toEqual([
      { entry_id: 3, sense: 1, pos: "動詞", yue: "食嘢；用餐", yue_simp: "食嘢；用餐", zho: null, zho_simp: null, source: "wordshk-dump" },
      { entry_id: 3, sense: 1, pos: "動", yue: null, yue_simp: null, zho: "吃飯。", zho_simp: "吃饭。", source: "moe" },
      { entry_id: 4, sense: 1, pos: null, yue: "香港中學文憑試", yue_simp: "香港中学文凭试", zho: null, zho_simp: null, source: "wordshk-dump" },
    ]);
    db.close();
  });

  it("writes examples with their reading, loan indexes and Mandarin translation", () => {
    const db = build();
    expect(db.prepare("SELECT * FROM examples ORDER BY rowid").all()).toEqual([
      {
        entry_id: 3,
        sense: 1,
        yue_trad: "去食飯",
        yue_simp: "去食饭",
        jyutping: "heoi3 sik6 faan6",
        loan: null,
        zho: "去吃飯",
        zho_simp: "去吃饭",
        source: "wordshk-dump",
      },
      { entry_id: 4, sense: 1, yue_trad: "考DSE", yue_simp: "考DSE", jyutping: "haau2 di1 es1 ji1", loan: "2", zho: null, zho_simp: null, source: "wordshk-dump" },
    ]);
    db.close();
  });

  it("writes each reading's search keys once per entry", () => {
    const db = build();
    const keys = (id: number) => db.prepare("SELECT key, type FROM search_keys WHERE entry_id = ? ORDER BY rowid").all(id);
    expect(keys(1)).toEqual([
      { key: "sik6", type: "toned" },
      { key: "sik", type: "toneless" },
      { key: "zi6", type: "toned" },
      { key: "zi", type: "toneless" },
    ]);
    expect(keys(3)).toEqual([
      { key: "sik6faan6", type: "toned" },
      { key: "sikfaan", type: "toneless" },
      { key: "sikfaan6", type: "joined" },
    ]);
    // DSE: keys stop before the loan syllable es1.
    expect(keys(4)).toEqual([
      { key: "di1", type: "toned" },
      { key: "di", type: "toneless" },
    ]);
    // Two readings differing only in tone share their toneless key: stored once.
    const twoTones = build([{ ...SIK, readings: [{ jyutping: "sik6", source: "rime" }, { jyutping: "sik1", source: "unihan" }] }]);
    expect(twoTones.prepare("SELECT key, type FROM search_keys ORDER BY rowid").all()).toEqual([
      { key: "sik6", type: "toned" },
      { key: "sik", type: "toneless" },
      { key: "sik1", type: "toned" },
    ]);
    twoTones.close();
    db.close();
  });

  it("gives the same content for the same entries", () => {
    const a = build();
    const b = build();
    expect(dumpTables(a)).toEqual(dumpTables(b));
    a.close();
    b.close();
  });

  it("leaves no database behind when the build fails, and keeps an existing one", () => {
    const path = tempPath();
    const bad = { ...FAAN, kind: "phrase" } as unknown as Entry;
    expect(() => writeDb(path, [SIK, bad])).toThrow();
    expect(existsSync(path)).toBe(false);

    writeFileSync(path, "previous build");
    expect(() => writeDb(path, [SIK, bad])).toThrow();
    expect(readFileSync(path, "utf8")).toBe("previous build");
  });

  it("replaces an existing database", () => {
    const path = tempPath();
    writeDb(path, ENTRIES);
    writeDb(path, [FAAN]);
    const db = new Database(path, { readonly: true });
    expect(db.prepare("SELECT trad FROM entries").all()).toEqual([{ trad: "飯" }]);
    db.close();
  });

  it("matches the committed fixture DB (regenerate: npm run data:fixture)", () => {
    const fresh = build(merge(FIXTURE_INPUTS).entries);
    const committed = new Database(FIXTURE_DB_PATH, { readonly: true });
    expect(tableNames(committed)).toEqual(TABLES);
    expect(dumpTables(committed)).toEqual(dumpTables(fresh));
    for (const table of TABLES) expect((fresh.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n, table).toBeGreaterThan(0);
    committed.close();
    fresh.close();
  });
});
