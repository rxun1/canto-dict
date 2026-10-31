/** A value bound to a `?` placeholder. */
export type SqlParam = string | number | null;

/**
 * The read-only database the app queries. Async so expo-sqlite's async API fits (expoDb.ts); Jest
 * uses better-sqlite3 over the fixture DB (testDb.ts). Only src/db/ writes SQL against it.
 */
export interface Db {
  /** Every row the query returns, in order. */
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** The first row, or null when there is none. */
  first<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
}
