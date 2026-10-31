// Jest only: an empty in-memory user.db (better-sqlite3) with the user schema applied.
import Database from "better-sqlite3";
import { toTestDb } from "../db/testDb";
import type { SqlParam } from "../db/types";
import { USER_SCHEMA_SQL } from "./schema";
import type { UserDb } from "./types";

export type TestUserDb = UserDb & { close(): void; raw: Database.Database };

/** A fresh in-memory user.db; close it in afterEach/afterAll. */
export function openTestUserDb(): TestUserDb {
  const raw = new Database(":memory:");
  raw.exec(USER_SCHEMA_SQL);
  return {
    ...toTestDb(raw),
    run: async (sql: string, params: readonly SqlParam[] = []) => {
      raw.prepare(sql).run(...params);
    },
    raw,
  };
}
