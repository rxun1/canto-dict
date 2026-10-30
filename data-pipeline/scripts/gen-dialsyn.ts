// Generates data/wiktionary-dialsyn.json (committed) from the pinned kaikki.org Lua-module tarball.
// kaikki replaces that tarball weekly and keeps no old copies, so the pipeline reads this extract
// instead of the download. Run: cd data-pipeline && npx tsx scripts/gen-dialsyn.ts
// The tarball comes from the cache (sha256-checked), a fresh download, or the CANTO_SRC_* override;
// buildDialSynExtract re-checks its hash against the pin and validates everything before we write.
import { writeFileSync } from "node:fs";
import { fetchToCache } from "../src/download";
import { formatProblems } from "../src/sources/problems";
import { WIKTIONARY_DIALSYN_CACHE_NAME, WIKTIONARY_DIALSYN_SHA256, WIKTIONARY_DIALSYN_URL } from "../src/sources/urls";
import { buildDialSynExtract } from "../src/sources/wiktionaryDialSyn";
import { DIALSYN_EXTRACT_PATH } from "../src/sources/wiktionaryDialSynExtract";

const tarball = await fetchToCache(WIKTIONARY_DIALSYN_URL, WIKTIONARY_DIALSYN_CACHE_NAME, { sha256: WIKTIONARY_DIALSYN_SHA256 });
const { text, parsedTables, pairCount, skipped } = await buildDialSynExtract(tarball);
if (skipped.length > 0) console.warn(formatProblems("Wiktionary dial-syn (skipped modules)", skipped));
writeFileSync(DIALSYN_EXTRACT_PATH, text);
console.log(`Parsed ${parsedTables} tables (${skipped.length} modules skipped); wrote ${pairCount} pairs (${Buffer.byteLength(text)} bytes) to ${DIALSYN_EXTRACT_PATH}`);
