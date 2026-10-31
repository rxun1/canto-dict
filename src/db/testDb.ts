// Jest only: better-sqlite3 (a devDependency) over the committed fixture DB that data-pipeline builds
// from its fixtures/ (npm run data:fixture in data-pipeline).
import Database from "better-sqlite3";
import { join } from "path";
import type { Db, SqlParam } from "./types";

export const FIXTURE_DB_PATH = join(__dirname, "../../assets/test/canto.fixture.db");

/** Opens the fixture DB read-only; close it in afterAll. */
export function openTestDb(): Db & { close(): void } {
  const db = new Database(FIXTURE_DB_PATH, { readonly: true, fileMustExist: true });
  return {
    all: async <T>(sql: string, params: readonly SqlParam[] = []) => db.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: readonly SqlParam[] = []) => (db.prepare(sql).get(...params) as T | undefined) ?? null,
    close: () => db.close(),
  };
}
