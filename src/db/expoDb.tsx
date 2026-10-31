// The app's Db: expo-sqlite over canto.db. Only this file imports expo-sqlite; screens and logic take
// a Db (types.ts) from useDb().
//
// Not SQLiteProvider: it renders nothing while opening (no loading screen) and, with useSuspense,
// caches a failed open so it can't be retried. DbGate shows the loading, error and Retry screens.
import { deleteDatabaseAsync, importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Db, SqlParam } from "./types";

/**
 * Bump whenever assets/canto.db is rebuilt. The asset is copied only when no file of this name
 * exists, so a new name is what makes an app update replace the old copy.
 */
export const CANTO_DB_VERSION = 1;
const cantoDbName = (version: number) => `canto-v${version}.db`;
export const CANTO_DB_NAME = cantoDbName(CANTO_DB_VERSION);
/** Copies left by earlier versions (63 MB each), deleted after a successful open. */
export const LEGACY_CANTO_DB_NAMES = ["canto.db", ...Array.from({ length: CANTO_DB_VERSION - 1 }, (_, i) => cantoDbName(i + 1))];
const ASSET_SOURCE = { assetId: require("../../assets/canto.db") };

const DbContext = createContext<Db | null>(null);

/** A database failed to open; DbGate tells it apart from errors thrown by screens. */
export class DbOpenError extends Error {
  constructor(readonly reason: unknown) {
    super(`Opening a database failed: ${String(reason)}`);
    this.name = "DbOpenError";
  }
}

/** Wraps an expo-sqlite database in the Db interface. */
export function toDb(database: SQLiteDatabase): Db {
  return {
    all: <T,>(sql: string, params: readonly SqlParam[] = []) => database.getAllAsync<T>(sql, [...params]),
    first: <T,>(sql: string, params: readonly SqlParam[] = []) => database.getFirstAsync<T>(sql, [...params]),
  };
}

/**
 * Runs open once per mount (remount to retry) and returns the database, or null while it is opening.
 * Closes it on unmount. A failure is thrown during render as a DbOpenError, to the nearest error
 * boundary (DbGate).
 */
export function useOpenDatabase(open: () => Promise<SQLiteDatabase>): SQLiteDatabase | null {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  // Boxed so a falsy rejection value still counts as a failure.
  const [failure, setFailure] = useState<{ error: DbOpenError } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: SQLiteDatabase | null = null;
    open().then(
      (result) => {
        // Unmounted (or StrictMode's probe cleanup) while opening: close it here, the cleanup couldn't.
        if (cancelled) return void result.closeAsync().catch(() => {});
        opened = result;
        setDatabase(result);
      },
      (error: unknown) => {
        if (!cancelled) setFailure({ error: new DbOpenError(error) });
      },
    );
    return () => {
      cancelled = true;
      opened?.closeAsync().catch(() => {});
    };
    // open runs once per mount by design.
  }, []);

  if (failure) throw failure.error;
  return database;
}

/**
 * Copies canto.db from the asset if this version isn't on the device yet, then opens it. SQLite opens
 * lazily, so a probe query checks the copy is readable; a damaged copy is deleted so Retry copies the
 * asset again (the copy is skipped while a file of that name exists).
 */
async function openCantoDb(): Promise<SQLiteDatabase> {
  await importDatabaseFromAssetAsync(CANTO_DB_NAME, ASSET_SOURCE);
  // expo-sqlite has no read-only open option; Db only exposes reads.
  const database = await openDatabaseAsync(CANTO_DB_NAME);
  try {
    await database.getFirstAsync("SELECT 1 FROM entries LIMIT 1");
  } catch (error) {
    await database.closeAsync().catch(() => {});
    await deleteDatabaseAsync(CANTO_DB_NAME).catch(() => {});
    throw error;
  }
  // Throws when the file is absent, which is the usual case.
  await Promise.all(LEGACY_CANTO_DB_NAMES.map((name) => deleteDatabaseAsync(name).catch(() => {})));
  return database;
}

/** Opens canto.db for its children; shows loading (e.g. the first launch's asset copy) until ready. */
export function DbProvider({ loading, children }: { loading?: ReactNode; children: ReactNode }) {
  const database = useOpenDatabase(openCantoDb);
  const db = useMemo(() => database && toDb(database), [database]);
  if (!db) return loading;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

/** The open database, for components under DbProvider. */
export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error("useDb must be used under DbProvider");
  return db;
}
