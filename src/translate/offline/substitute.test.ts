import { openTestDb } from "../../db/testDb";
import type { Db } from "../../db/types";
import { toTrad } from "../script";
import { createPhraseTable, phraseTable, substitute } from "./substitute";

const db = openTestDb();
afterAll(() => db.close());

// Phrases are the fixture DB's phrase_map (assets/test/canto.fixture.db), which has every curated pair.
const translate = async (mandarin: string) => substitute(await phraseTable(db), toTrad(mandarin));

describe("substitute", () => {
  it("translates the goldens (他没有钱 → 佢冇錢, 我在家看电视 → 我喺屋企睇電視)", async () => {
    expect(await translate("他没有钱")).toBe("佢冇錢");
    expect(await translate("我在家看电视")).toBe("我喺屋企睇電視");
  });

  it("matches the longest phrase first (什麼時候 before 什麼)", async () => {
    expect(await translate("什么时候")).toBe("幾時");
    expect(await translate("什么")).toBe("乜嘢");
  });

  it("leaves text without a phrase as it is (punctuation, Latin, unknown words)", () => {
    const table = createPhraseTable(new Map([["沒有", "冇"]]));
    expect(substitute(table, "OK，電視沒有。")).toBe("OK，電視冇。");
    expect(substitute(table, "")).toBe("");
  });

  it("matches by character (code point), outside the BMP too", () => {
    const table = createPhraseTable(new Map([["𠮶個", "嗰個"], ["個", "X"]]));
    expect(substitute(table, "𠮶個個")).toBe("嗰個X");
    expect(table.maxKeyLength).toBe(2);
  });

  it("tries keys as long as the table's longest, and no longer", () => {
    const table = createPhraseTable(new Map([["一二三四五六七八九十甲乙", "長"], ["一", "壹"]]));
    expect(substitute(table, "一二三四五六七八九十甲乙一")).toBe("長壹");
    expect(table.maxKeyLength).toBe(12);
  });
});

describe("phraseTable", () => {
  it("loads phrase_map once per Db and reuses it", async () => {
    let queries = 0;
    const counting: Db = { all: (sql, params) => (queries++, db.all(sql, params)), first: db.first };
    const first = await phraseTable(counting);
    expect(await phraseTable(counting)).toBe(first);
    expect(queries).toBe(1);
  });

  it("loads again after a failed load", async () => {
    let fail = true;
    const flaky: Db = {
      all: (sql, params) => (fail ? Promise.reject(new Error("no table")) : db.all(sql, params)),
      first: db.first,
    };
    await expect(phraseTable(flaky)).rejects.toThrow("no table");
    fail = false;
    expect(substitute(await phraseTable(flaky), "沒有")).toBe("冇");
  });
});
