import type { MergeInputs } from "../src/merge/types";

/** MergeInputs with every source empty (the optional dump included), overridden by `parts`. */
export function inputs(parts: Partial<MergeInputs> = {}): MergeInputs {
  return {
    rimeChars: [],
    lshk: [],
    unihan: [],
    rimeWords: [],
    wordshkList: [],
    wordshkDump: [],
    kaifangcidian: [],
    wiktionary: [],
    moe: [],
    essay: [],
    ...parts,
  };
}
