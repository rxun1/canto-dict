// Determinism (DoD): the same inputs give byte-identical output, whatever the input row order.
// Inputs are the repo's real source fixtures, parsed by the real parsers.
import { merge } from "../src/merge/merge";
import type { MergeInputs } from "../src/merge/types";
import { fixtureInputs } from "../src/fixtureInputs";

const FIXTURE_INPUTS = fixtureInputs();

/** A deterministic Fisher-Yates shuffle (mulberry32 PRNG), so a failure reproduces. */
function shuffled<T>(rows: readonly T[], seed: number): T[] {
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Every input array reordered by `reorder`. */
function reorderAll(inputs: MergeInputs, reorder: <T>(rows: readonly T[]) => T[]): MergeInputs {
  return Object.fromEntries(Object.entries(inputs).map(([name, rows]) => [name, reorder(rows as readonly unknown[])])) as unknown as MergeInputs;
}

describe("merge determinism", () => {
  const expected = JSON.stringify(merge(FIXTURE_INPUTS));

  it("merges the fixtures into a non-trivial result (every kind of row present)", () => {
    const { entries } = merge(FIXTURE_INPUTS);
    expect(entries.some((e) => e.kind === "char") && entries.some((e) => e.kind === "word")).toBe(true);
    for (const rows of ["readings", "mandarin", "definitions", "examples", "aliases"] as const) {
      expect(entries.some((e) => e[rows].length > 0), rows).toBe(true);
    }
    expect(entries.some((e) => e.freq > 0)).toBe(true);
  });

  it("gives byte-identical output for the same inputs", () => {
    expect(JSON.stringify(merge(FIXTURE_INPUTS))).toBe(expected);
  });

  it("gives byte-identical output whatever the order of the input rows", () => {
    expect(JSON.stringify(merge(reorderAll(FIXTURE_INPUTS, (rows) => [...rows].reverse())))).toBe(expected);
    for (const seed of [1, 2, 3]) {
      expect(JSON.stringify(merge(reorderAll(FIXTURE_INPUTS, (rows) => shuffled(rows, seed)))), `seed ${seed}`).toBe(expected);
    }
  });

  it("sorts entries by key", () => {
    const keys = merge(FIXTURE_INPUTS).entries.map((e) => e.key);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

describe("merge input checks", () => {
  it("collects structural problems in the inputs and throws them once", () => {
    const bad = {
      ...FIXTURE_INPUTS,
      rimeChars: [...FIXTURE_INPUTS.rimeChars, { char: "五五", jyutping: "ng5", rank: "default" as const }],
      wordshkDump: [...FIXTURE_INPUTS.wordshkDump!, FIXTURE_INPUTS.wordshkDump![0]],
      moe: [...FIXTURE_INPUTS.moe, FIXTURE_INPUTS.moe[0]],
      essay: [...FIXTURE_INPUTS.essay, FIXTURE_INPUTS.essay[0]],
    };
    const err = (() => {
      try {
        merge(bad);
      } catch (e) {
        return e as Error;
      }
      throw new Error("merge did not throw");
    })();
    expect(err.message).toContain("merge inputs has 4 problem(s)");
    expect(err.message).toContain(`entry ${bad.rimeChars.length}: rimeChars: character must be one code point: "五五"`);
    expect(err.message).toContain(`duplicate words.hk dump id ${FIXTURE_INPUTS.wordshkDump![0].id}`);
    expect(err.message).toContain(`duplicate MoE headword ${FIXTURE_INPUTS.moe[0].word}`);
    expect(err.message).toContain(`duplicate essay word ${FIXTURE_INPUTS.essay[0].word}`);
  });
});
