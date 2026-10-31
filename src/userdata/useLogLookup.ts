// Spec §5.2: opening an entry appends it to history.
import { useEffect, useRef } from "react";
import { addHistory } from "./history";
import type { UserDb } from "./types";

/**
 * Logs a lookup once per entry id the caller shows (null: nothing loaded yet). The ref keeps a re-run
 * effect (StrictMode, a new db object) from logging the same open twice.
 */
export function useLogLookup(db: UserDb, entryId: number | null): void {
  const logged = useRef<number | null>(null);
  useEffect(() => {
    if (entryId === null || logged.current === entryId) return;
    logged.current = entryId;
    addHistory(db, { kind: "lookup", entryId }).catch((error: unknown) => console.warn("Logging history failed", error));
  }, [db, entryId]);
}
