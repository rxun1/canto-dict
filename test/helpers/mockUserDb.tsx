// Jest only: stands in for src/userdata/expoUserDb (expo-sqlite is native). Use it as
//   jest.mock("../src/userdata/expoUserDb", () => require("./helpers/mockUserDb"));
// UserDbProvider just renders its children; useUserDb() returns an in-memory user.db that
// resetMockUserDb() replaces with a fresh one.
import type { ReactNode } from "react";
import { openTestUserDb, type TestUserDb } from "../../src/userdata/testUserDb";

let db: TestUserDb = openTestUserDb();

export const UserDbProvider = ({ children }: { children: ReactNode }) => children;

export const useUserDb = (): TestUserDb => db;

/** Closes the current user.db and opens an empty one; returns it, for seeding and checking rows. */
export function resetMockUserDb(): TestUserDb {
  db.close();
  db = openTestUserDb();
  return db;
}
