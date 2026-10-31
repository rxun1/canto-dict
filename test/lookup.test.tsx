// Lookup screen (spec §5.1): debounced search over the fixture DB, the hint for unsearchable input,
// and navigation to an entry.
import type { ReactNode } from "react";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { SEARCH_DEBOUNCE_MS } from "../src/dictionary/useSearch";

// expo-sqlite is native: useDb() returns the fixture DB (better-sqlite3) instead.
jest.mock("../src/db/expoDb", () => {
  const { openTestDb } = jest.requireActual("../src/db/testDb");
  const db = openTestDb();
  return { DbProvider: ({ children }: { children: ReactNode }) => children, useDb: () => db };
});

const PLACEHOLDER = "汉字或粤拼";

async function type(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), text);
}

/** Runs the debounce timer, then lets the search promise settle. */
async function finishDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

describe("lookup screen", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows result rows only after the debounce", async () => {
    await renderRouter("./app", { initialUrl: "/lookup" });
    await type("行");
    expect(screen.queryByText("行街")).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(screen.queryByText("行街")).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByText("行")).toBeTruthy();
    expect(screen.getByText("行街")).toBeTruthy();
    expect(screen.getByText("银行")).toBeTruthy();
    // Traditional appears beside simplified only when it differs.
    expect(screen.getByText("銀行")).toBeTruthy();
    expect(screen.getByText("haang4")).toBeTruthy();
  });

  it("shows results for every tone of a toneless Jyutping query", async () => {
    await renderRouter("./app", { initialUrl: "/lookup" });
    await type("hong");
    await finishDebounce();
    expect(screen.getByText("hong4")).toBeTruthy();
  });

  it("shows the hint for text that is not Jyutping, and nothing for blank input", async () => {
    await renderRouter("./app", { initialUrl: "/lookup" });
    await type("water");
    await finishDebounce();
    expect(screen.getByText("输入汉字或粤拼")).toBeTruthy();

    await type("  ");
    await finishDebounce();
    expect(screen.queryByText("输入汉字或粤拼")).toBeNull();
  });

  it("clears the results at once when the input is cleared", async () => {
    await renderRouter("./app", { initialUrl: "/lookup" });
    await type("行");
    await finishDebounce();
    expect(screen.getByText("行街")).toBeTruthy();

    await type("");
    expect(screen.queryByText("行街")).toBeNull();
  });

  it("opens the entry when a row is tapped", async () => {
    const router = await renderRouter("./app", { initialUrl: "/lookup" });
    await type("行街");
    await finishDebounce();
    await fireEvent.press(screen.getByText("行街"));
    expect(router.getPathname()).toBe("/entry/101");
  });
});
