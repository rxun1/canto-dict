// The app's UserDb: expo-sqlite over user.db. Only this file imports expo-sqlite for user data;
// screens take a UserDb (types.ts) from useUserDb().
//
// Its own context, opened like canto.db (useOpenDatabase); DbGate mounts it inside DbProvider.
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { toDb, useOpenDatabase } from "../db/expoDb";
import type { SqlParam } from "../db/types";
import { USER_DB_NAME, USER_SCHEMA_SQL } from "./schema";
import type { UserDb } from "./types";

const UserDbContext = createContext<UserDb | null>(null);

/** Wraps an expo-sqlite database in the UserDb interface. */
export function toUserDb(database: SQLiteDatabase): UserDb {
  return {
    ...toDb(database),
    run: async (sql: string, params: readonly SqlParam[] = []) => {
      await database.runAsync(sql, [...params]);
    },
  };
}

/** Opens user.db (created on first use) and applies the schema; closes it if that fails. */
async function openUserDb(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(USER_DB_NAME);
  try {
    await database.execAsync(USER_SCHEMA_SQL);
  } catch (error) {
    await database.closeAsync().catch(() => {});
    throw error;
  }
  return database;
}

/**
 * Opens user.db (writable, never an asset) for its children; shows loading until it is ready. An
 * open failure is thrown during render, to the nearest error boundary (DbGate).
 */
export function UserDbProvider({ loading, children }: { loading?: ReactNode; children: ReactNode }) {
  const database = useOpenDatabase(openUserDb);
  const db = useMemo(() => database && toUserDb(database), [database]);
  if (!db) return loading;
  return <UserDbContext.Provider value={db}>{children}</UserDbContext.Provider>;
}

/** The open user.db, for components under UserDbProvider. */
export function useUserDb(): UserDb {
  const db = useContext(UserDbContext);
  if (!db) throw new Error("useUserDb must be used under UserDbProvider");
  return db;
}
