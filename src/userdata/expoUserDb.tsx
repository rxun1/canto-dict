// The app's UserDb: expo-sqlite over user.db. Only this file imports expo-sqlite for user data;
// screens take a UserDb (types.ts) from useUserDb().
//
// Not SQLiteProvider: nested inside DbProvider it would shadow canto.db's useSQLiteContext().
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toDb } from "../db/expoDb";
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

/**
 * Opens user.db (created on first use, writable, never an asset) and applies the schema; children
 * render once it is ready. An open failure is thrown during render, to the nearest error boundary.
 */
export function UserDbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<UserDb | null>(null);
  // Boxed so a falsy rejection value still counts as a failure.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let database: SQLiteDatabase | null = null;
    (async () => {
      const opened = await openDatabaseAsync(USER_DB_NAME);
      // Unmounted (or StrictMode's probe cleanup) while opening: close it here, the cleanup couldn't.
      if (cancelled) return opened.closeAsync();
      database = opened;
      await opened.execAsync(USER_SCHEMA_SQL);
      if (!cancelled) setDb(toUserDb(opened));
    })().catch((error: unknown) => {
      if (!cancelled) setFailure({ error });
    });
    return () => {
      cancelled = true;
      database?.closeAsync().catch(() => {});
    };
  }, []);

  if (failure) throw failure.error;
  if (!db) return null;
  return <UserDbContext.Provider value={db}>{children}</UserDbContext.Provider>;
}

/** The open user.db, for components under UserDbProvider. */
export function useUserDb(): UserDb {
  const db = useContext(UserDbContext);
  if (!db) throw new Error("useUserDb must be used under UserDbProvider");
  return db;
}
