// Saved tab (spec §5.3) and the entry screen's ☆ and history logging (spec §5.2), over the fixture
// DB and an in-memory user.db.
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { listFavorites, toggleFavorite } from "../src/userdata/favorites";
import { addHistory, listHistory } from "../src/userdata/history";
import type { TestUserDb } from "../src/userdata/testUserDb";
import RootLayout from "../app/_layout";
import { resetMockUserDb } from "./helpers/mockUserDb";

// expo-sqlite is native: useDb() returns the fixture DB, useUserDb() an in-memory user.db.
jest.mock("../src/db/expoDb", () => {
  const { openTestDb } = jest.requireActual("../src/db/testDb");
  const db = openTestDb();
  return { DbProvider: ({ children }: { children: ReactNode }) => children, useDb: () => db };
});
jest.mock("../src/userdata/expoUserDb", () => require("./helpers/mockUserDb"));

// expo-audio is native too, and loads with the entry screen.
jest.mock("../src/audio/playSyllables", () => ({ playSyllables: jest.fn(), speakTts: jest.fn() }));

const ADD_FAVORITE = "收藏";
const REMOVE_FAVORITE = "取消收藏";
const FAVORITES_TAB = "收藏";
const HISTORY_TAB = "历史";

let userDb: TestUserDb;
beforeEach(() => {
  userDb = resetMockUserDb();
});
afterEach(() => jest.restoreAllMocks());

// The imperative `router` export stays bound to the first test's navigation container, so tests
// navigate with the router the real root layout gets from useRouter().
let appRouter: ReturnType<typeof useRouter>;
function RouterCapturingLayout() {
  appRouter = useRouter();
  return <RootLayout />;
}

const open = (url: string) => renderRouter({ appDir: "./app", overrides: { _layout: RouterCapturingLayout } }, { initialUrl: url });
const openSaved = () => open("/saved");

/** Lets pending user.db writes and the renders they cause settle. */
const flush = () => act(async () => {});

async function showHistory() {
  await fireEvent.press(await screen.findByRole("tab", { name: HISTORY_TAB }));
}

describe("entry screen ☆", () => {
  it("toggles the entry into the Favorites list and out again", async () => {
    await open("/entry/100");
    await fireEvent.press(await screen.findByRole("button", { name: ADD_FAVORITE }));
    expect(await screen.findByRole("button", { name: REMOVE_FAVORITE })).toBeTruthy();
    expect((await listFavorites(userDb)).map((f) => f.entryId)).toEqual([100]);

    await act(() => appRouter.push("/saved"));
    const list = within(await screen.findByTestId("saved-list"));
    expect(await list.findByText("行")).toBeTruthy();
    expect(list.getByText("haang4")).toBeTruthy();

    await act(() => appRouter.push("/entry/100"));
    await fireEvent.press(await screen.findByRole("button", { name: REMOVE_FAVORITE }));
    expect(await screen.findByRole("button", { name: ADD_FAVORITE })).toBeTruthy();
    expect(await listFavorites(userDb)).toEqual([]);
  });

  it("shows ★ for an entry that is already a favorite", async () => {
    await toggleFavorite(userDb, 103);
    await open("/entry/103");
    expect(await screen.findByRole("button", { name: REMOVE_FAVORITE })).toBeTruthy();
  });

  it("ignores taps while a toggle is in flight", async () => {
    await open("/entry/100");
    const star = await screen.findByRole("button", { name: ADD_FAVORITE });
    // The open is logged first, so the spy below sees only toggle writes.
    await flush();
    expect(await listHistory(userDb)).toHaveLength(1);
    // Hold the first toggle's write until both extra taps are in.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = userDb.run;
    const runSpy = jest.spyOn(userDb, "run").mockImplementation(async (sql, params) => {
      await gate;
      return run(sql, params);
    });
    await fireEvent.press(star);
    await fireEvent.press(star);
    await fireEvent.press(star);
    await act(async () => release());
    await screen.findByRole("button", { name: REMOVE_FAVORITE });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect((await listFavorites(userDb)).map((f) => f.entryId)).toEqual([100]);
  });
});

describe("history logging", () => {
  it("adds an opened entry to History once", async () => {
    await open("/entry/101");
    await screen.findByText("haang4 gaai1");
    await flush();
    expect(await listHistory(userDb)).toHaveLength(1);
    // A re-render (toggling ☆) doesn't log again. (useLogLookup's ref guards re-run effects, e.g.
    // StrictMode; toggling doesn't re-run the effect, so this doesn't exercise the ref.)
    await fireEvent.press(screen.getByRole("button", { name: ADD_FAVORITE }));
    await screen.findByRole("button", { name: REMOVE_FAVORITE });
    expect(await listHistory(userDb)).toMatchObject([{ kind: "lookup", entryId: 101 }]);

    await act(() => appRouter.push("/saved"));
    await showHistory();
    expect(await within(screen.getByTestId("saved-list")).findByText("行街")).toBeTruthy();
  });

  it("does not log an entry that does not exist", async () => {
    await open("/entry/999999");
    await screen.findByText("找不到这个词条");
    expect(await listHistory(userDb)).toEqual([]);
  });
});

describe("saved tab", () => {
  it("opens on Favorites and says so when there are none", async () => {
    await openSaved();
    expect(await screen.findByText("还没有收藏")).toBeTruthy();
    expect(screen.getByRole("tab", { name: FAVORITES_TAB }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it("lists favorites newest first", async () => {
    await toggleFavorite(userDb, 100, 1000);
    await toggleFavorite(userDb, 103, 2000);
    await openSaved();
    const list = within(await screen.findByTestId("saved-list"));
    await list.findByText("银行");
    const rows = list.getAllByRole("button").map((row) => within(row).queryByText(/^(行|银行)$/)?.props.children);
    expect(rows).toEqual(["银行", "行"]);
  });

  it("lists history newest first, lookups and translations", async () => {
    await addHistory(userDb, { kind: "lookup", entryId: 100 }, 1000);
    await addHistory(userDb, { kind: "translation", input: "冰箱", output: "雪櫃" }, 2000);
    await addHistory(userDb, { kind: "lookup", entryId: 103 }, 3000);
    await openSaved();
    await showHistory();
    const list = within(await screen.findByTestId("saved-list"));
    await list.findByText("银行");
    const ids = list.getAllByTestId(/^history-/).map((row) => row.props.testID);
    expect(ids).toEqual(["history-3", "history-2", "history-1"]);
    const translation = within(list.getByTestId("history-2"));
    expect(translation.getByText("冰箱")).toBeTruthy();
    expect(translation.getByText("雪櫃")).toBeTruthy();
  });

  it("skips favorites and history whose entry canto.db no longer has", async () => {
    await toggleFavorite(userDb, 999999, 2000);
    await toggleFavorite(userDb, 100, 1000);
    await addHistory(userDb, { kind: "lookup", entryId: 999999 });
    await openSaved();
    const list = within(await screen.findByTestId("saved-list"));
    expect(await list.findByText("行")).toBeTruthy();
    expect(list.getAllByRole("button")).toHaveLength(1);

    await showHistory();
    expect(await screen.findByText("还没有历史记录")).toBeTruthy();
  });

  it("opens an entry when a row is tapped", async () => {
    await toggleFavorite(userDb, 101);
    const router = await openSaved();
    await fireEvent.press(await screen.findByText("行街"));
    expect(router.getPathname()).toBe("/entry/101");
  });

  it("Clear empties History", async () => {
    await addHistory(userDb, { kind: "lookup", entryId: 100 });
    await addHistory(userDb, { kind: "translation", input: "冰箱", output: "雪櫃" });
    await openSaved();
    await showHistory();
    await within(await screen.findByTestId("saved-list")).findByText("行");
    await fireEvent.press(screen.getByRole("button", { name: "清除" }));
    expect(await screen.findByText("还没有历史记录")).toBeTruthy();
    expect(await listHistory(userDb)).toEqual([]);
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });

  it("says so when loading fails instead of showing a blank list", async () => {
    jest.spyOn(userDb, "all").mockRejectedValue(new Error("disk I/O error"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await openSaved();
    expect(await screen.findByText("加载失败")).toBeTruthy();
  });

  it("refreshes when focused again, showing a favorite added on an entry", async () => {
    await openSaved();
    await screen.findByText("还没有收藏");
    await act(() => appRouter.push("/entry/100"));
    await fireEvent.press(await screen.findByRole("button", { name: ADD_FAVORITE }));
    await screen.findByRole("button", { name: REMOVE_FAVORITE });
    await act(() => appRouter.back());
    expect(await within(screen.getByTestId("saved-list")).findByText("行")).toBeTruthy();
  });
});
