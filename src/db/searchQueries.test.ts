import { getEntrySummaries } from "./searchQueries";
import { openTestDb } from "./testDb";

const db = openTestDb();
afterAll(() => db.close());

// Ids are the fixture DB's (assets/test/canto.fixture.db).
describe("getEntrySummaries", () => {
  it("returns each entry's headword, first reading and gloss by id", async () => {
    const summaries = await getEntrySummaries(db, [101, 100, 103]);
    expect(summaries.get(100)).toEqual({ id: 100, trad: "行", simp: "行", jyutping: "haang4", gloss: { source: "mandarin", trad: expect.any(String), simp: "行走" } });
    expect(summaries.get(101)).toMatchObject({ trad: "行街", jyutping: "haang4 gaai1" });
    expect(summaries.get(103)).toMatchObject({ trad: "銀行", simp: "银行", jyutping: "ngan4 hong4" });
  });

  it("leaves out ids canto.db has no entry for, and handles repeats and no ids", async () => {
    const summaries = await getEntrySummaries(db, [100, 999999, 100]);
    expect([...summaries.keys()]).toEqual([100]);
    expect((await getEntrySummaries(db, [])).size).toBe(0);
  });
});
