import { act, renderHook } from "@testing-library/react-native";
import type { Db } from "../db/types";
import { SEARCH_DEBOUNCE_MS, useSearch } from "./useSearch";

/** A Db whose queries stay pending until resolved by hand, in call order. */
function deferredDb() {
  const pending: ((rows: unknown[]) => void)[] = [];
  const db: Db = {
    all: <T,>() => new Promise<T[]>((resolve) => pending.push(resolve as (rows: unknown[]) => void)),
    first: async () => null,
  };
  return { db, pending };
}

// One searchQueries result row with no reading or gloss.
const row = (id: number, trad: string) => ({
  id, trad, simp: trad, quality: 0, jyutping: null,
  mandarinTrad: null, mandarinSimp: null, zho: null, zhoSimp: null, yue: null, yueSimp: null,
});

describe("useSearch", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("ignores a query's results once a newer query has finished", async () => {
    const { db, pending } = deferredDb();
    const { result, rerender } = await renderHook((text: string) => useSearch(db, text), { initialProps: "行" });
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    await rerender("街");
    await act(async () => {
      jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(pending).toHaveLength(2);

    // The newer query finishes first, then the older one.
    await act(async () => pending[1]([row(2, "街")]));
    await act(async () => pending[0]([row(1, "行")]));
    expect(result.current.results.map((r) => r.trad)).toEqual(["街"]);
  });
});
