// Generates assets/test/canto.fixture.db (committed): canto.db built from the source fixtures, for the
// app's tests. test/writeDb.test.ts fails when it is out of date. Run: cd data-pipeline && npx tsx scripts/gen-fixture-db.ts
import { statSync } from "node:fs";
import { FIXTURE_DB_PATH, writeDb } from "../src/build/writeDb";
import { merge } from "../src/merge/merge";
import { FIXTURE_INPUTS } from "../test/fixtureInputs";

const { entries } = merge(FIXTURE_INPUTS);
writeDb(FIXTURE_DB_PATH, entries);
console.log(`Wrote ${entries.length} entries (${statSync(FIXTURE_DB_PATH).size} bytes) to ${FIXTURE_DB_PATH}`);
