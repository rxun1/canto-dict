// Lookup search as a hook (spec §5.1): runs search() SEARCH_DEBOUNCE_MS after the input stops
// changing, so each keystroke doesn't start a query.
import { useEffect, useState } from "react";
import type { Db } from "../db/types";
import { classify } from "./classify";
import { search, type SearchResult } from "./search";

/** Spec §5.1: search once the input has been unchanged this long. */
export const SEARCH_DEBOUNCE_MS = 150;

export interface SearchState {
  /** The input is not searchable (classify() kind "none"): show 输入汉字或粤拼. */
  hint: boolean;
  results: SearchResult[];
}

const IDLE: SearchState = { hint: false, results: [] };

/**
 * Search state for lookup input. While a new query is pending, the previous results stay on screen;
 * blank input clears them at once. A query's results are dropped if the input changed before they
 * arrived, so a slow older query can't replace a newer one's results.
 */
export function useSearch(db: Db, text: string): SearchState {
  const [state, setState] = useState<SearchState>(IDLE);

  useEffect(() => {
    const query = classify(text);
    if (query.kind === "empty") {
      setState(IDLE);
      return;
    }
    // Set by the cleanup when the input (or db) changes or the screen unmounts.
    let stale = false;
    const timer = setTimeout(() => {
      if (query.kind === "none") {
        setState({ hint: true, results: [] });
        return;
      }
      search(db, query).then(
        (results) => {
          if (!stale) setState({ hint: false, results });
        },
        (error: unknown) => {
          console.warn("Lookup search failed", error);
          if (!stale) setState(IDLE);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [db, text]);

  return state;
}
