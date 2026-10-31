// Entry screen (spec §5.2) over the fixture DB plus stand-in rows for entries it lacks.
import { existsSync } from "fs";
import type { ReactNode } from "react";
import { fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import type { Db } from "../src/db/types";
import { FULL_DB_PATH, openDbCopy, openTestDb, type TestDb } from "../src/db/testDb";

// expo-sqlite is native: useDb() returns whichever test DB a describe block opened.
let mockDb: Db;
jest.mock("../src/db/expoDb", () => ({
  DbProvider: ({ children }: { children: ReactNode }) => children,
  useDb: () => mockDb,
}));

// The fixture DB has no 冇 or 學校 (and no MoE definitions at all), so these copy their full-DB rows.
const MOU5 = 1001;
const HOK6_HAAU6 = 1002;
const HOK6 = 1003;
const HAAU6 = 1004;

function addStandIns(db: ReturnType<typeof openDbCopy>) {
  const entry = db.raw.prepare("INSERT INTO entries (id, trad, simp, kind, freq) VALUES (?, ?, ?, ?, 0)");
  const reading = db.raw.prepare("INSERT INTO readings (entry_id, jyutping, rank, source) VALUES (?, ?, ?, 'rime')");
  const mandarin = db.raw.prepare("INSERT INTO mandarin (entry_id, word_trad, word_simp, sources) VALUES (?, ?, ?, 'kaifangcidian')");
  const moe = db.raw.prepare("INSERT INTO definitions (entry_id, sense, pos, zho, zho_simp, source) VALUES (?, ?, ?, ?, ?, 'moe')");

  entry.run(MOU5, "冇", "冇", "char");
  reading.run(MOU5, "mou5", "default");
  reading.run(MOU5, "mo5", "obsolete");
  mandarin.run(MOU5, "沒有", "没有");
  mandarin.run(MOU5, "沒", "没");
  mandarin.run(MOU5, "無", "无");

  entry.run(HOK6_HAAU6, "學校", "学校", "word");
  reading.run(HOK6_HAAU6, "hok6 haau6", null);
  moe.run(HOK6_HAAU6, 1, null, "講學研習的教育機構。", "讲学研习的教育机构。");

  entry.run(HOK6, "學", "学", "char");
  entry.run(HAAU6, "校", "校", "char");
}

const openEntry = (id: number) => renderRouter("./app", { initialUrl: `/entry/${id}` });

describe("entry screen", () => {
  let db: ReturnType<typeof openDbCopy>;
  beforeAll(() => {
    db = openDbCopy();
    addStandIns(db);
    mockDb = db;
  });
  afterAll(() => db.close());

  it("shows the Mandarin equivalents (冇 → 没有)", async () => {
    await openEntry(MOU5);
    expect(await screen.findByText("普通话：没有、没、无")).toBeTruthy();
  });

  it("falls back to the MoE definition (學校) and shows traditional beside simplified", async () => {
    await openEntry(HOK6_HAAU6);
    expect(await screen.findByText("普通话：讲学研习的教育机构。")).toBeTruthy();
    expect(screen.getByText("学校")).toBeTruthy();
    expect(screen.getByText("學校")).toBeTruthy();
    // The definition itself is listed too, under the MoE heading.
    expect(screen.getByText("1. 讲学研习的教育机构。")).toBeTruthy();
  });

  it("falls back to the words.hk explanation, labelled 粤语释义 (東)", async () => {
    await openEntry(94);
    expect(await screen.findByText("粤语释义：主人")).toBeTruthy();
  });

  it("lists every reading of 行 with its rank tag", async () => {
    await openEntry(100);
    await screen.findByTestId("reading-hang4");
    const tags = Object.fromEntries(
      ["haang4", "hang4", "hang6", "hong4", "hong2", "hong6"].map((jyutping) => {
        const row = within(screen.getByTestId(`reading-${jyutping}`));
        expect(row.getByText(jyutping)).toBeTruthy();
        return [jyutping, row.getByTestId("rank-tag").props.children];
      }),
    );
    expect(tags).toEqual({ haang4: "常用", hang4: "常用", hang6: "常用", hong4: "常用", hong2: "罕用", hong6: "旧读" });
    // Traditional is shown only when it differs.
    expect(screen.getAllByText("行")).toHaveLength(1);
  });

  it("shows no rank tag for a word reading", async () => {
    await openEntry(103);
    const row = within(await screen.findByTestId("reading-ngan4 hong4"));
    expect(row.queryByTestId("rank-tag")).toBeNull();
  });

  it("links each character of a word to its own entry", async () => {
    const router = await openEntry(101);
    const links = await screen.findAllByRole("link");
    expect(links).toHaveLength(1);
    expect(within(links[0]).getByText("行")).toBeTruthy();
    // 街 has no char entry in the fixture: shown, but not a link.
    expect(within(screen.getByTestId("chars")).getByText("街")).toBeTruthy();

    await fireEvent.press(links[0]);
    expect(router.getPathname()).toBe("/entry/100");
  });

  it("links a word's characters by their traditional form and shows them simplified", async () => {
    const router = await openEntry(HOK6_HAAU6);
    const chars = within(await screen.findByTestId("chars"));
    await fireEvent.press(chars.getByText("学"));
    expect(router.getPathname()).toBe(`/entry/${HOK6}`);
  });

  it("lists definitions by sense with their examples, Jyutping and Mandarin", async () => {
    await openEntry(43);
    // Sense number, part of speech, then the explanation.
    expect(await screen.findByText("1. 副词 「唔使」嘅书面语")).toBeTruthy();
    expect(screen.getByText("2. 副词 「唔用」嘅书面语")).toBeTruthy();
    const sense1 = within(screen.getByTestId("sense-wordshk-dump-1"));
    expect(sense1.getByText("唔使客气")).toBeTruthy();
    expect(sense1.getByText("m4 sai2 haak3 hei3")).toBeTruthy();
    expect(sense1.getByText("不用客气")).toBeTruthy();
  });

  it("says so when there is no such entry", async () => {
    await openEntry(999999);
    expect(await screen.findByText("找不到这个词条")).toBeTruthy();
  });

  it("says loading failed, not that the entry is missing, when the DB query fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const failing: Db = { all: () => Promise.reject(new Error("disk I/O error")), first: () => Promise.reject(new Error("disk I/O error")) };
    mockDb = failing;
    try {
      await openEntry(100);
      expect(await screen.findByText("词条加载失败")).toBeTruthy();
      expect(screen.queryByText("找不到这个词条")).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      mockDb = db;
      warn.mockRestore();
    }
  });
});

// The real rows, when canto.db has been built (it is not committed).
(existsSync(FULL_DB_PATH) ? describe : describe.skip)("entry screen on the full canto.db", () => {
  let db: TestDb;
  beforeAll(() => {
    db = openTestDb(FULL_DB_PATH);
    mockDb = db;
  });
  afterAll(() => db.close());

  const idOf = async (trad: string) => (await db.first<{ id: number }>("SELECT id FROM entries WHERE trad = ?", [trad]))!.id;

  it("shows 普通话：没有 first for 冇", async () => {
    await openEntry(await idOf("冇"));
    expect(await screen.findByText(/^普通话：没有、/)).toBeTruthy();
  });

  it("shows the MoE definition for 學校", async () => {
    await openEntry(await idOf("學校"));
    expect(await screen.findByText("普通话：讲学研习的教育机构。")).toBeTruthy();
  });
});
