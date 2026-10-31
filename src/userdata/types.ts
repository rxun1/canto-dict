import type { Db, SqlParam } from "../db/types";

/**
 * The writable user.db (favorites, history). Kept apart from canto.db's read-only Db so only
 * src/userdata/ can write. expoUserDb.tsx wraps expo-sqlite; Jest uses testUserDb.ts.
 */
export interface UserDb extends Db {
  /** Runs a statement that returns no rows (INSERT, DELETE, ...). */
  run(sql: string, params?: readonly SqlParam[]): Promise<void>;
}
