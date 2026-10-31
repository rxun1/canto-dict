// The app's Db: expo-sqlite over canto.db. Only this file imports expo-sqlite; screens and logic take
// a Db (types.ts) from useDb().
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";
import { useMemo, type ReactNode } from "react";
import type { Db, SqlParam } from "./types";

const DATABASE_NAME = "canto.db";
// Copied into the app's SQLite directory on first launch; an existing copy is kept.
const ASSET_SOURCE = { assetId: require("../../assets/canto.db") };

/** Wraps an expo-sqlite database in the Db interface. */
export function toDb(database: SQLiteDatabase): Db {
  return {
    all: <T,>(sql: string, params: readonly SqlParam[] = []) => database.getAllAsync<T>(sql, [...params]),
    first: <T,>(sql: string, params: readonly SqlParam[] = []) => database.getFirstAsync<T>(sql, [...params]),
  };
}

/** Opens canto.db for its children; they render once it is ready. */
export function DbProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} assetSource={ASSET_SOURCE}>
      {children}
    </SQLiteProvider>
  );
}

/** The open database, for components under DbProvider. */
export function useDb(): Db {
  const database = useSQLiteContext();
  return useMemo(() => toDb(database), [database]);
}
