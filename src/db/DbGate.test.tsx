import { fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { USER_DB_NAME } from "../userdata/schema";
import { useUserDb } from "../userdata/expoUserDb";
import { DbGate, LOADING, OPEN_FAILED as ERROR_TEXT, RETRY, SOMETHING_FAILED } from "./DbGate";
import { CANTO_DB_NAME, LEGACY_CANTO_DB_NAMES, useDb } from "./expoDb";

// expo-sqlite is native: each open is a stub that answers any query with one row. A name in
// mockFailing makes its next open throw, one in mockCorrupt its next query; mockOpenGate holds every
// open in progress. mockLog records opens, closes and deletes in order.
const mockOpened: string[] = [];
const mockImported: string[] = [];
const mockLog: string[] = [];
const mockFailing = new Set<string>();
const mockCorrupt = new Set<string>();
let mockOpenGate: Promise<void> = Promise.resolve();
jest.mock("expo-sqlite", () => ({
  importDatabaseFromAssetAsync: async (name: string) => void mockImported.push(name),
  deleteDatabaseAsync: async (name: string) => void mockLog.push(`delete ${name}`),
  openDatabaseAsync: async (name: string) => {
    mockOpened.push(name);
    mockLog.push(`open ${name}`);
    await mockOpenGate;
    if (mockFailing.delete(name)) throw new Error(`cannot open ${name}`);
    const query = async <T,>(row: T) => {
      if (mockCorrupt.delete(name)) throw new Error("database disk image is malformed");
      return row;
    };
    return {
      execAsync: async () => {},
      runAsync: async () => {},
      getAllAsync: () => query([{ ok: 1 }]),
      getFirstAsync: () => query({ ok: 1 }),
      closeAsync: async () => void mockLog.push(`close ${name}`),
    };
  },
}));

/** Stands in for the app: queries both databases. */
function App() {
  const db = useDb();
  const userDb = useUserDb();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([db.first("SELECT 1"), userDb.first("SELECT 1")]).then(() => setReady(true));
  }, [db, userDb]);
  return <Text>{ready ? "app ready" : "app loading"}</Text>;
}

beforeEach(() => {
  mockOpened.length = 0;
  mockImported.length = 0;
  mockLog.length = 0;
  mockFailing.clear();
  mockCorrupt.clear();
  mockOpenGate = Promise.resolve();
  // React reports errors an error boundary catches to console.error; DbGate logs them with warn.
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("copies canto.db from the asset, opens both databases and shows the app", async () => {
  await render(<DbGate><App /></DbGate>);
  expect(await screen.findByText("app ready")).toBeTruthy();
  expect(mockImported).toEqual([CANTO_DB_NAME]);
  expect(mockOpened).toEqual([CANTO_DB_NAME, USER_DB_NAME]);
});

it("shows a loading screen while canto.db is opening", async () => {
  let release = () => {};
  mockOpenGate = new Promise((resolve) => (release = resolve));
  await render(<DbGate><App /></DbGate>);
  expect(screen.getByText(LOADING)).toBeTruthy();
  release();
  expect(await screen.findByText("app ready")).toBeTruthy();
});

it("shows a full-screen error with Retry when canto.db fails to open; Retry opens it again", async () => {
  mockFailing.add(CANTO_DB_NAME);
  await render(<DbGate><App /></DbGate>);
  expect(await screen.findByText(ERROR_TEXT)).toBeTruthy();
  expect(screen.queryByText(/app/)).toBeNull();

  await fireEvent.press(screen.getByRole("button", { name: RETRY }));
  expect(await screen.findByText("app ready")).toBeTruthy();
  expect(screen.queryByText(ERROR_TEXT)).toBeNull();
  expect(mockOpened.filter((name) => name === CANTO_DB_NAME)).toHaveLength(2);
});

it("shows the same error screen when user.db fails to open; Retry opens it again", async () => {
  mockFailing.add(USER_DB_NAME);
  await render(<DbGate><App /></DbGate>);
  expect(await screen.findByText(ERROR_TEXT)).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: RETRY }));
  expect(await screen.findByText("app ready")).toBeTruthy();
  expect(mockOpened.filter((name) => name === USER_DB_NAME)).toHaveLength(2);
});

it("keeps showing the error when Retry fails again", async () => {
  mockFailing.add(CANTO_DB_NAME);
  await render(<DbGate><App /></DbGate>);
  await screen.findByText(ERROR_TEXT);
  mockFailing.add(CANTO_DB_NAME);
  await fireEvent.press(screen.getByRole("button", { name: RETRY }));
  expect(await screen.findByText(ERROR_TEXT)).toBeTruthy();
  expect(screen.queryByText(/app/)).toBeNull();
});

it("closes canto.db before Retry opens it again", async () => {
  mockFailing.add(USER_DB_NAME);
  await render(<DbGate><App /></DbGate>);
  await screen.findByText(ERROR_TEXT);
  await fireEvent.press(screen.getByRole("button", { name: RETRY }));
  await screen.findByText("app ready");
  const opens = mockLog.flatMap((entry, i) => (entry === `open ${CANTO_DB_NAME}` ? [i] : []));
  expect(opens).toHaveLength(2);
  expect(mockLog.indexOf(`close ${CANTO_DB_NAME}`)).toBeGreaterThan(opens[0]);
  expect(mockLog.indexOf(`close ${CANTO_DB_NAME}`)).toBeLessThan(opens[1]);
});

it("closes a database that finishes opening after unmount", async () => {
  let release = () => {};
  mockOpenGate = new Promise((resolve) => (release = resolve));
  const view = await render(<DbGate><App /></DbGate>);
  await view.unmount();
  release();
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockLog).toContain(`close ${CANTO_DB_NAME}`);
});

it("deletes an unreadable canto.db copy, so Retry copies the asset again", async () => {
  mockCorrupt.add(CANTO_DB_NAME);
  await render(<DbGate><App /></DbGate>);
  expect(await screen.findByText(ERROR_TEXT)).toBeTruthy();
  expect(mockLog).toEqual([`open ${CANTO_DB_NAME}`, `close ${CANTO_DB_NAME}`, `delete ${CANTO_DB_NAME}`]);
  await fireEvent.press(screen.getByRole("button", { name: RETRY }));
  expect(await screen.findByText("app ready")).toBeTruthy();
  expect(mockImported).toEqual([CANTO_DB_NAME, CANTO_DB_NAME]);
});

it("deletes copies left under earlier names after a successful open", async () => {
  await render(<DbGate><App /></DbGate>);
  await screen.findByText("app ready");
  expect(LEGACY_CANTO_DB_NAMES).toContain("canto.db");
  for (const name of LEGACY_CANTO_DB_NAMES) expect(mockLog).toContain(`delete ${name}`);
  expect(mockLog).not.toContain(`delete ${CANTO_DB_NAME}`);
});

it("shows a generic error, not the database one, when a screen throws", async () => {
  function Broken(): never {
    throw new Error("render bug");
  }
  await render(<DbGate><Broken /></DbGate>);
  expect(await screen.findByText(SOMETHING_FAILED)).toBeTruthy();
  expect(screen.queryByText(ERROR_TEXT)).toBeNull();
});
