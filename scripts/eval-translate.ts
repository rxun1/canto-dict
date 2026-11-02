// Scores the offline translator (toTrad → substitute → applyRules) on eval/test-set.tsv with chrF
// against the Cantonese references, over the full assets/canto.db (npm run data:build in
// data-pipeline). Both sides go through toSimp first, so variant spellings (説/說, 裏/裡) don't count
// as misses while Cantonese characters (係, 嗰) still do. Run: npm run eval:translate
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { FULL_DB_PATH, openTestDb } from "../src/db/testDb";
import { applyRules } from "../src/translate/offline/rules";
import { phraseTable, substitute } from "../src/translate/offline/substitute";
import { toSimp, toTrad } from "../src/translate/script";
import { corpusChrf } from "./chrf";

const TEST_SET_PATH = join(__dirname, "../eval/test-set.tsv");

async function main(): Promise<void> {
  if (!existsSync(FULL_DB_PATH)) throw new Error(`${FULL_DB_PATH} is missing: run npm run data:build in data-pipeline`);
  const [header, ...rows] = readFileSync(TEST_SET_PATH, "utf8").trimEnd().split("\n");
  const columns = header.split("\t");
  const zhColumn = columns.indexOf("zh");
  const yueColumn = columns.indexOf("yue");

  const db = openTestDb(FULL_DB_PATH);
  try {
    const table = await phraseTable(db);
    const pairs = rows.map((line) => {
      const cells = line.split("\t");
      const translation = applyRules(substitute(table, toTrad(cells[zhColumn])));
      return [toSimp(translation), toSimp(cells[yueColumn])] as const;
    });
    console.log(`chrF: ${corpusChrf(pairs).toFixed(1)}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
