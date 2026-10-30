// Generates src/jyutping/syllableList.ts from the LSHK table and rime-cantonese char.csv.
// Run: cd data-pipeline && npx tsx scripts/gen-syllables.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LSHK_URL = "https://raw.githubusercontent.com/lshk-org/jyutping-table/master/list.tsv";
const RIME_URL = "https://raw.githubusercontent.com/CanCLID/rime-cantonese-upstream/main/char.csv";
const OUT = fileURLToPath(new URL("../../src/jyutping/syllableList.ts", import.meta.url));
const SYLLABLE = /^([a-z]+)([1-6])$/;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Split a pronunciation cell (may hold several space-separated syllables). Report malformed tokens. */
function collect(cell: string, bases: Set<string>, rejected: Set<string>, toned?: Set<string>): void {
  for (const token of cell.trim().split(/\s+/)) {
    if (token === "") continue;
    const m = SYLLABLE.exec(token);
    if (!m) {
      rejected.add(token);
      continue;
    }
    bases.add(m[1]);
    toned?.add(token);
  }
}

const [lshk, rime] = await Promise.all([fetchText(LSHK_URL), fetchText(RIME_URL)]);
const bases = new Set<string>();
const rejected = new Set<string>();
const lshkToned = new Set<string>();

// LSHK list.tsv: header row, JP is the 3rd tab-separated column (e.g. "jau1"); some rows have it empty.
for (const line of lshk.split("\n").slice(1)) collect(line.split("\t")[2] ?? "", bases, rejected, lshkToned);
// rime char.csv: header row, jyutping is the 2nd column (e.g. "ling4"); no quoted commas in practice.
for (const line of rime.split("\n").slice(1)) collect(line.split(",")[1] ?? "", bases, rejected);

const sorted = [...bases].sort();
const date = new Date().toISOString().slice(0, 10);
const body = sorted.map((s) => `  "${s}",`).join("\n");
writeFileSync(
  OUT,
  `// GENERATED FILE - do not edit by hand.
// Toneless Jyutping syllables attested in real data: the union of
//   - LSHK Jyutping table (CC BY 4.0): ${LSHK_URL}
//   - rime-cantonese-upstream char.csv (CC BY 4.0): ${RIME_URL}
// Generated ${date}. Regenerate: cd data-pipeline && npx tsx scripts/gen-syllables.ts
export const ATTESTED_SYLLABLES: readonly string[] = [
${body}
];
`,
);

// Definition of done: every LSHK syllable (with tone) must pass isValidSyllable.
const { isValidSyllable } = await import("../../src/jyutping/syllables");
const failures = [...lshkToned].filter((s) => !isValidSyllable(s));
if (failures.length > 0) throw new Error(`LSHK syllables failing validation: ${failures.join(", ")}`);
console.log(`Wrote ${sorted.length} syllables to ${OUT}`);
console.log(`Checked ${lshkToned.size} distinct toned LSHK syllables: all valid`);
console.log(`Rejected malformed tokens: ${rejected.size}${rejected.size ? " " + [...rejected].join(", ") : ""}`);
