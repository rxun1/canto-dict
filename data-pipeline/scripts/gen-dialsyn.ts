// Generates data/wiktionary-dialsyn.json (committed) from the pinned kaikki.org Lua-module tarball.
// kaikki replaces that tarball weekly and keeps no old copies, so the pipeline reads this extract
// instead of the download. Run: cd data-pipeline && npx tsx scripts/gen-dialsyn.ts
// The tarball comes from the cache (sha256-checked), a fresh download, or the CANTO_SRC_* override.
import { writeFileSync } from "node:fs";
import { fetchToCache } from "../src/download";
import { formatProblems } from "../src/sources/problems";
import { WIKTIONARY_DIALSYN_CACHE_NAME, WIKTIONARY_DIALSYN_SHA256, WIKTIONARY_DIALSYN_URL } from "../src/sources/urls";
import {
  DIALSYN_EXTRACT_PATH,
  formatDialSynExtract,
  parseDialSynExtract,
  parseDialSynModules,
  readDialSynTarball,
} from "../src/sources/wiktionaryDialSyn";

const tarball = await fetchToCache(WIKTIONARY_DIALSYN_URL, WIKTIONARY_DIALSYN_CACHE_NAME, { sha256: WIKTIONARY_DIALSYN_SHA256 });
const modules = await readDialSynTarball(tarball);
// Parse and validate BEFORE writing, so a bad refresh never overwrites the committed extract:
// parseDialSynModules throws on structural problems, and the output must read back as written.
const { rows, skipped } = parseDialSynModules(modules);
if (skipped.length > 0) console.warn(formatProblems("Wiktionary dial-syn (skipped modules)", skipped));
const text = formatDialSynExtract(rows);
if (parseDialSynExtract(text).length !== rows.length) throw new Error("extract does not read back as written");

writeFileSync(DIALSYN_EXTRACT_PATH, text);
console.log(`Read ${modules.length} tables, skipped ${skipped.length}; wrote ${rows.length} pairs (${Buffer.byteLength(text)} bytes) to ${DIALSYN_EXTRACT_PATH}`);
