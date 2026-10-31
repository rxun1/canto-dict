// Jest only: better-sqlite3 (a devDependency) over the committed fixture DB that data-pipeline builds
// from its fixtures/ (npm run data:fixture in data-pipeline), the full canto.db, or an empty schema DB.
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import type { Db, SqlParam } from "./types";

export const FIXTURE_DB_PATH = join(__dirname, "../../assets/test/canto.fixture.db");
/** The full DB that `npm run data:build` writes; not committed, so tests using it must skip when absent. */
export const FULL_DB_PATH = join(__dirname, "../../assets/canto.db");
const SCHEMA_PATH = join(__dirname, "../../data-pipeline/src/build/schema.sql");

export type TestDb = Db & { close(): void };

function toTestDb(db: Database.Database): TestDb {
  return {
    all: async <T>(sql: string, params: readonly SqlParam[] = []) => db.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: readonly SqlParam[] = []) => (db.prepare(sql).get(...params) as T | undefined) ?? null,
    close: () => db.close(),
  };
}

/** Opens a DB file (the fixture DB by default) read-only; close it in afterAll. */
export function openTestDb(path: string = FIXTURE_DB_PATH): TestDb {
  return toTestDb(new Database(path, { readonly: true, fileMustExist: true }));
}

/** An empty in-memory DB with canto.db's schema, for hand-made rows (insert them through `raw`). */
export function openSchemaDb(): TestDb & { raw: Database.Database } {
  const raw = new Database(":memory:");
  raw.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return { ...toTestDb(raw), raw };
}

/** A writable in-memory copy of a DB file (the fixture DB by default), for adding stand-in rows through `raw`. */
export function openDbCopy(path: string = FIXTURE_DB_PATH): TestDb & { raw: Database.Database } {
  const raw = new Database(readFileSync(path));
  return { ...toTestDb(raw), raw };
}
