// The entry screen's ☆ (spec §5.2): whether the entry is a favorite, and a toggle.
import { useCallback, useEffect, useRef, useState } from "react";
import { isFavorite, toggleFavorite } from "./favorites";
import type { UserDb } from "./types";

/**
 * `favorite` is null until known (or while entryId is null). toggleFavorite reads then writes, so a
 * toggle started while one is in flight is ignored; a result for an id the caller has since left is dropped.
 */
export function useFavorite(db: UserDb, entryId: number | null): { favorite: boolean | null; toggle: () => void } {
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const busy = useRef(false);
  const current = useRef(entryId);
  current.current = entryId;

  useEffect(() => {
    setFavorite(null);
    if (entryId === null) return;
    let stale = false;
    isFavorite(db, entryId).then(
      (f) => {
        if (!stale) setFavorite(f);
      },
      (error: unknown) => console.warn("Reading favorite failed", error),
    );
    return () => {
      stale = true;
    };
  }, [db, entryId]);

  const toggle = useCallback(() => {
    if (entryId === null || busy.current) return;
    busy.current = true;
    toggleFavorite(db, entryId)
      .then(
        (f) => {
          if (current.current === entryId) setFavorite(f);
        },
        (error: unknown) => console.warn("Toggling favorite failed", error),
      )
      .finally(() => {
        busy.current = false;
      });
  }, [db, entryId]);

  return { favorite, toggle };
}
