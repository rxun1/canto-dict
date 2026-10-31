import { render, screen } from "@testing-library/react-native";
import Database from "better-sqlite3";
import { Text } from "react-native";
import { useEffect, useState } from "react";
import { UserDbProvider, useUserDb } from "./expoUserDb";
import { toggleFavorite, listFavorites } from "./favorites";
import { USER_DB_NAME } from "./schema";

// expo-sqlite is native: stand in an in-memory better-sqlite3 behind the async methods expoUserDb uses.
const mockOpened: string[] = [];
let mockClosed = 0;
// openDatabaseAsync waits for this, so a test can hold the open in progress.
let mockOpenGate: Promise<void> = Promise.resolve();
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (name: string) => {
    mockOpened.push(name);
    await mockOpenGate;
    const raw = new (require("better-sqlite3") as typeof Database)(":memory:");
    return {
      execAsync: async (sql: string) => void raw.exec(sql),
      runAsync: async (sql: string, params: unknown[]) => raw.prepare(sql).run(...params),
      getAllAsync: async (sql: string, params: unknown[]) => raw.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, params: unknown[]) => raw.prepare(sql).get(...params) ?? null,
      closeAsync: async () => {
        mockClosed++;
        raw.close();
      },
    };
  },
}));

function FavoriteCount() {
  const db = useUserDb();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    toggleFavorite(db, 81).then(() => listFavorites(db)).then((f) => setCount(f.length));
  }, [db]);
  return <Text>{count === null ? "loading" : `favorites: ${count}`}</Text>;
}

it("opens user.db with the schema applied and gives children a working UserDb", async () => {
  await render(
    <UserDbProvider>
      <FavoriteCount />
    </UserDbProvider>,
  );
  expect(await screen.findByText("favorites: 1")).toBeTruthy();
  expect(mockOpened).toEqual([USER_DB_NAME]);
});

it("closes the database when unmounted while it is still opening", async () => {
  mockOpened.length = 0;
  mockClosed = 0;
  let release = () => {};
  mockOpenGate = new Promise((resolve) => (release = resolve));
  const view = await render(
    <UserDbProvider>
      <FavoriteCount />
    </UserDbProvider>,
  );
  await view.unmount();
  release();
  await new Promise((resolve) => setImmediate(resolve));
  expect(mockOpened).toEqual([USER_DB_NAME]);
  expect(mockClosed).toBe(1);
});
