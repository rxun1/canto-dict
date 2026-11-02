import { readFileSync } from "fs";
import { join } from "path";
import { isFavorite, listFavorites, toggleFavorite } from "./favorites";
import { addHistory, clearHistory, getHistoryItem, listHistory } from "./history";
import { HISTORY_LIMIT, USER_SCHEMA_SQL } from "./schema";
import { openTestUserDb, type TestUserDb } from "./testUserDb";

let db: TestUserDb;
beforeEach(() => {
  db = openTestUserDb();
});
afterEach(() => db.close());

describe("favorites", () => {
  it("toggleFavorite adds then removes", async () => {
    expect(await isFavorite(db, 81)).toBe(false);
    expect(await toggleFavorite(db, 81, 1000)).toBe(true);
    expect(await isFavorite(db, 81)).toBe(true);
    expect(await listFavorites(db)).toEqual([{ entryId: 81, addedAt: 1000 }]);
    expect(await toggleFavorite(db, 81, 2000)).toBe(false);
    expect(await isFavorite(db, 81)).toBe(false);
    expect(await listFavorites(db)).toEqual([]);
  });

  it("listFavorites is newest first, ties broken by the higher entry id", async () => {
    await toggleFavorite(db, 4, 3000);
    await toggleFavorite(db, 1, 1000);
    await toggleFavorite(db, 2, 3000);
    await toggleFavorite(db, 3, 2000);
    expect((await listFavorites(db)).map((f) => f.entryId)).toEqual([4, 2, 3, 1]);
  });
});

describe("history", () => {
  it("stores both kinds, newest first", async () => {
    await addHistory(db, { kind: "lookup", entryId: 81 }, 1000);
    await addHistory(db, { kind: "translation", input: "冰箱", output: "雪柜" }, 2000);
    expect(await listHistory(db)).toEqual([
      { id: 2, kind: "translation", input: "冰箱", output: "雪柜", at: 2000 },
      { id: 1, kind: "lookup", entryId: 81, at: 1000 },
    ]);
  });

  it("orders by insertion, not timestamp, so a clock set back can't bury or drop a new row", async () => {
    for (let i = 1; i <= HISTORY_LIMIT; i++) await addHistory(db, { kind: "lookup", entryId: i }, 10_000 + i);
    await addHistory(db, { kind: "lookup", entryId: 9999 }, 1);
    const rows = await listHistory(db);
    expect(rows).toHaveLength(HISTORY_LIMIT);
    expect(rows[0]).toMatchObject({ entryId: 9999, at: 1 });
    expect(rows[rows.length - 1]).toMatchObject({ entryId: 2 });
  });

  it(`keeps at most ${HISTORY_LIMIT} rows, dropping the oldest`, async () => {
    expect(HISTORY_LIMIT).toBe(500);
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) await addHistory(db, { kind: "lookup", entryId: i }, i);
    const rows = await listHistory(db);
    expect(rows).toHaveLength(HISTORY_LIMIT);
    expect(rows[0]).toMatchObject({ entryId: HISTORY_LIMIT + 5 });
    expect(rows[rows.length - 1]).toMatchObject({ entryId: 6 });
  });

  it("getHistoryItem returns one row by id, or null", async () => {
    await addHistory(db, { kind: "lookup", entryId: 81 }, 1000);
    await addHistory(db, { kind: "translation", input: "冰箱", output: "雪柜" }, 2000);
    expect(await getHistoryItem(db, 2)).toEqual({ id: 2, kind: "translation", input: "冰箱", output: "雪柜", at: 2000 });
    expect(await getHistoryItem(db, 1)).toEqual({ id: 1, kind: "lookup", entryId: 81, at: 1000 });
    expect(await getHistoryItem(db, 3)).toBeNull();
  });

  it("clearHistory empties it", async () => {
    await addHistory(db, { kind: "lookup", entryId: 81 }, 1000);
    await addHistory(db, { kind: "translation", input: "a", output: "b" }, 2000);
    await clearHistory(db);
    expect(await listHistory(db)).toEqual([]);
  });

  it("rejects an unknown kind", () => {
    expect(() => db.raw.prepare("INSERT INTO history (kind, at) VALUES ('other', 1)").run()).toThrow(/CHECK/);
  });

  it("rejects rows missing the columns their kind needs", () => {
    const insert = db.raw.prepare("INSERT INTO history (kind, entry_id, input, output, at) VALUES (?, ?, ?, ?, 1)");
    expect(() => insert.run("lookup", null, null, null)).toThrow(/CHECK/);
    expect(() => insert.run("lookup", 1, "a", "b")).toThrow(/CHECK/);
    expect(() => insert.run("translation", null, "a", null)).toThrow(/CHECK/);
    expect(() => insert.run("translation", 1, "a", "b")).toThrow(/CHECK/);
  });
});

describe("schema", () => {
  it("re-running it keeps existing rows (it runs on every open)", async () => {
    await toggleFavorite(db, 81, 1000);
    await addHistory(db, { kind: "lookup", entryId: 81 }, 1000);
    await db.run("INSERT INTO settings (key, value) VALUES ('provider', 'zai')");
    db.raw.exec(USER_SCHEMA_SQL);
    expect(await listFavorites(db)).toHaveLength(1);
    expect(await listHistory(db)).toHaveLength(1);
    expect(await db.first("SELECT value FROM settings WHERE key = 'provider'")).toEqual({ value: "zai" });
  });
});

// DoD: rebuilding canto.db never touches user.db (also: expoUserDb creates user.db on the device; it is never an asset).
describe("user.db stays separate from canto.db", () => {
  const ROOT = join(__dirname, "../..");

  it("shares no table with canto.db's schema", () => {
    const tables = (sql: string) => [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map((m) => m[1]);
    const canto = tables(readFileSync(join(ROOT, "data-pipeline/src/build/schema.sql"), "utf8"));
    const user = tables(USER_SCHEMA_SQL);
    expect(user).toEqual(["favorites", "history", "settings"]);
    expect(user.filter((t) => canto.includes(t))).toEqual([]);
  });
});
