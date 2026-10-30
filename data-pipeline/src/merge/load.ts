import { loadKaifangcidian } from "../sources/kaifangcidian";
import { loadLshk } from "../sources/lshk";
import { loadMoedict } from "../sources/moedict";
import { loadRimeChars } from "../sources/rimeChars";
import { loadRimeEssay } from "../sources/rimeEssay";
import { loadRimeWords } from "../sources/rimeWords";
import { loadUnihan } from "../sources/unihan";
import { loadWiktionaryDialSyn } from "../sources/wiktionaryDialSynExtract";
import { loadWordshkDump, wordshkDumpConfigured } from "../sources/wordshkDump";
import { loadWordshkList } from "../sources/wordshkList";
import type { MergeInputs } from "./types";

/**
 * Loads every source merge reads (downloading uncached ones). The words.hk dump is optional: when
 * CANTO_SRC_WORDSHK_DUMP is unset, `wordshkDump` is undefined and merge lists it as omitted.
 */
export async function loadMergeInputs(): Promise<MergeInputs> {
  return {
    rimeChars: await loadRimeChars(),
    lshk: await loadLshk(),
    unihan: await loadUnihan(),
    rimeWords: await loadRimeWords(),
    wordshkList: await loadWordshkList(),
    wordshkDump: wordshkDumpConfigured() ? await loadWordshkDump() : undefined,
    kaifangcidian: await loadKaifangcidian(),
    wiktionary: await loadWiktionaryDialSyn(),
    moe: await loadMoedict(),
    essay: await loadRimeEssay(),
  };
}
