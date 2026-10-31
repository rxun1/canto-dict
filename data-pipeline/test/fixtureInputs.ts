// The repo's real source fixtures, parsed by the real parsers: the inputs of the determinism test and
// of assets/test/canto.fixture.db (scripts/gen-fixture-db.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MergeInputs } from "../src/merge/types";
import { parseKaifangcidian } from "../src/sources/kaifangcidian";
import { parseLshk } from "../src/sources/lshk";
import { parseMoedict } from "../src/sources/moedict";
import { parseRimeChars } from "../src/sources/rimeChars";
import { parseRimeEssay } from "../src/sources/rimeEssay";
import { parseRimeWords } from "../src/sources/rimeWords";
import { parseUnihan } from "../src/sources/unihan";
import { DIALSYN_EXTRACT_PATH, parseDialSynExtract } from "../src/sources/wiktionaryDialSynExtract";
import { parseWordshkDump } from "../src/sources/wordshkDump";
import { parseWordshkList } from "../src/sources/wordshkList";

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "../fixtures", name), "utf8");

export const FIXTURE_INPUTS: MergeInputs = {
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
};
