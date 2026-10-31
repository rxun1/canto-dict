import { availableParallelism } from "node:os";

/** Default number of tasks in flight for I/O- or subprocess-bound work: one per CPU. */
export const DEFAULT_CONCURRENCY = availableParallelism();

/**
 * Maps `items` through `task` with at most `limit` calls in flight, returning results in input order.
 * Rejects with the first error; tasks already started still run to completion, but no new ones start.
 */
export async function mapConcurrent<T, R>(items: readonly T[], task: (item: T) => Promise<R>, limit = DEFAULT_CONCURRENCY): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await task(items[i]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const settled = await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, worker));
  const rejection = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (rejection) throw rejection.reason;
  return results;
}
