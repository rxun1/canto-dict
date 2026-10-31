// Lookup search (spec §5.1): classifies the input and runs the matching query from src/db, which
// also ranks, since only the top MAX_RESULTS rows should leave SQLite.
import { searchHanzi, searchJyutping, type SearchResult } from "../db/searchQueries";
import type { Db } from "../db/types";
import { classify, type Classification } from "./classify";

export type { Gloss, MatchQuality, SearchResult } from "../db/searchQueries";

/** Spec §5.1: top 50 results. */
export const MAX_RESULTS = 50;

/**
 * Ranked entries for lookup input (raw text, or classify()'s result if the caller has it). Not
 * searchable or blank input returns [] without querying.
 */
export async function search(db: Db, input: string | Classification, limit: number = MAX_RESULTS): Promise<SearchResult[]> {
  const query = typeof input === "string" ? classify(input) : input;
  switch (query.kind) {
    case "hanzi":
      return searchHanzi(db, query.text, limit);
    case "jyutping":
      return searchJyutping(db, query, limit);
    case "none":
    case "empty":
      return [];
  }
}
