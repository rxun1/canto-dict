// mapConcurrent: bounded parallel map that keeps input order and stops starting tasks after a failure.
import { mapConcurrent } from "../src/concurrency";

/** Resolves after `ms` milliseconds. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapConcurrent", () => {
  it("returns results in input order even when later tasks finish first, with at most `limit` in flight", async () => {
    const delays = [30, 5, 20, 1, 10];
    let inFlight = 0;
    let maxInFlight = 0;
    const results = await mapConcurrent(
      delays,
      async (ms) => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await sleep(ms);
        inFlight--;
        return ms * 2;
      },
      2,
    );
    expect(results).toEqual(delays.map((ms) => ms * 2));
    expect(maxInFlight).toBe(2);
  });

  it("rejects with the first error and starts no new task after it", async () => {
    const started: number[] = [];
    const failure = mapConcurrent(
      [0, 1, 2, 3, 4, 5],
      async (i) => {
        started.push(i);
        await sleep(i === 1 ? 1 : 20);
        if (i === 1) throw new Error("task 1 failed");
        return i;
      },
      2,
    );
    await expect(failure).rejects.toThrow("task 1 failed");
    // Tasks 0 and 1 start together; 1 fails while 0 is still running, so 0 finishes but nothing else starts.
    expect(started).toEqual([0, 1]);
  });
});
