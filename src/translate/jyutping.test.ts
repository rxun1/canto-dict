import { openDbCopy, openTestDb } from "../db/testDb";
import { textToJyutping } from "./jyutping";

const db = openTestDb();
afterAll(() => db.close());

// Words are the fixture DB's (assets/test/canto.fixture.db) unless a test adds stand-ins.
describe("textToJyutping", () => {
  it("reads dictionary words with their dictionary reading", async () => {
    expect(await textToJyutping(db, "銀行")).toEqual(["ngan4", "hong4"]);
  });

  it("prefers the word reading over to-jyutping's (一個人 jan1, 哥哥 go1 go1)", async () => {
    // to-jyutping reads these jat1 go3 jan4 and go4 go1.
    expect(await textToJyutping(db, "一個人")).toEqual(["jat1", "go3", "jan1"]);
    expect(await textToJyutping(db, "哥哥")).toEqual(["go1", "go1"]);
  });

  it("matches the longest word first", async () => {
    // Stand-in: a shorter word at the same position with a reading that would show if it won.
    const copy = openDbCopy();
    try {
      copy.raw.exec("INSERT INTO entries (id, trad, simp, kind, freq) VALUES (9001, '一個', '一个', 'word', 0)");
      copy.raw.exec("INSERT INTO readings (entry_id, jyutping, rank, source) VALUES (9001, 'jat1 go2', NULL, 'test')");
      expect(await textToJyutping(copy, "一個人")).toEqual(["jat1", "go3", "jan1"]);
    } finally {
      copy.close();
    }
  });

  it("skips a word reading without one valid syllable per character", async () => {
    const copy = openDbCopy();
    try {
      copy.raw.exec("INSERT INTO entries (id, trad, simp, kind, freq) VALUES (9002, '香港人', '香港人', 'word', 0)");
      // Both are 香港人's first readings in rowid order, so each would win without its check.
      copy.raw.exec("INSERT INTO readings (entry_id, jyutping, rank, source) VALUES (9002, 'hoeng1 gong2 jan1 jan1', NULL, 'test')");
      copy.raw.exec("INSERT INTO readings (entry_id, jyutping, rank, source) VALUES (9002, 'hoeng1 gong2 xyz1', NULL, 'test')");
      // Falls back to 香港 + to-jyutping's 人.
      expect(await textToJyutping(copy, "香港人")).toEqual(["hoeng1", "gong2", "jan4"]);
    } finally {
      copy.close();
    }
  });

  it("matches a word through its alias spelling", async () => {
    const copy = openDbCopy();
    try {
      copy.raw.exec("INSERT INTO aliases (entry_id, trad, simp) SELECT id, '哥哥哥', '哥哥哥' FROM entries WHERE trad = '一個人'");
      expect(await textToJyutping(copy, "哥哥哥")).toEqual(["jat1", "go3", "jan1"]);
    } finally {
      copy.close();
    }
  });

  it("falls back to to-jyutping for characters in no dictionary word (食 is not in the fixture)", async () => {
    expect(await textToJyutping(db, "食")).toEqual(["sik6"]);
    expect(await textToJyutping(db, "食銀行")).toEqual(["sik6", "ngan4", "hong4"]);
  });

  it("gives punctuation and Latin null, even a Latin dictionary word (DSE)", async () => {
    expect(await textToJyutping(db, "銀行，OK。")).toEqual(["ngan4", "hong4", null, null, null, null]);
    expect(await textToJyutping(db, "DSE")).toEqual([null, null, null]);
  });

  it("returns one item per character (code point), outside the BMP too", async () => {
    expect(await textToJyutping(db, "𭉝𭉝")).toEqual(["syu4", "syu2"]);
    expect(await textToJyutping(db, "")).toEqual([]);
  });

  it("handles text with more candidate words than one query can bind", async () => {
    // 5,000 distinct Han characters (U+4E00 on) give ~35,000 distinct candidate words, more than
    // SQLite's default limit of 32,766 bound parameters per statement.
    const distinct = Array.from({ length: 5000 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("");
    const result = await textToJyutping(db, distinct + "銀行");
    expect(result).toHaveLength(5002);
    expect(result.slice(-2)).toEqual(["ngan4", "hong4"]);
  });
});
