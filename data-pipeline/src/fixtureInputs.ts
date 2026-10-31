// The repo's real source fixtures, parsed by the real parsers: the inputs of the determinism test and
// of assets/test/canto.fixture.db (npm run data:fixture).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MergeInputs } from "./merge/types";
import { parseKaifangcidian } from "./sources/kaifangcidian";
import { parseLshk } from "./sources/lshk";
import { parseMoedict } from "./sources/moedict";
import { parseRimeChars } from "./sources/rimeChars";
import { parseRimeEssay } from "./sources/rimeEssay";
import { parseRimeWords } from "./sources/rimeWords";
import { parseUnihan } from "./sources/unihan";
import { DIALSYN_EXTRACT_PATH, parseDialSynExtract } from "./sources/wiktionaryDialSynExtract";
import { parseWordshkDump } from "./sources/wordshkDump";
import { parseWordshkList } from "./sources/wordshkList";

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "../fixtures", name), "utf8");

/** Parses every source fixture in data-pipeline/fixtures/ (no network). */
export const fixtureInputs = (): MergeInputs => ({
  rimeChars: parseRimeChars(fixture("rime-char.csv")),
  lshk: parseLshk(fixture("lshk-list.tsv")).rows,
  unihan: parseUnihan(fixture("unihan-kcantonese.txt")).rows,
  rimeWords: parseRimeWords(fixture("rime-words.dict.yaml")).rows,
  wordshkList: parseWordshkList(fixture("wordshk-list.csv")).rows,
  wordshkDump: parseWordshkDump(fixture("wordshk-all.csv")).rows,
  kaifangcidian: parseKaifangcidian(fixture("kfcd-cidian-ft.txt"), fixture("kfcd-cidian-jt.txt")).rows,
  wiktionary: parseDialSynExtract(readFileSync(DIALSYN_EXTRACT_PATH, "utf8")),
  moe: parseMoedict(fixture("moedict-sample.json")).rows,
  essay: parseRimeEssay(fixture("rime-essay-cantonese.txt")).rows,
});
