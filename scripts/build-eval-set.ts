// Builds eval/test-set.tsv: Mandarin → Cantonese pairs sampled (fixed seed, so reruns give the same
// file while the datasets don't change) from two Hugging Face parallel corpora through the public
// datasets-server rows API. Credits and licences: eval/README.md. Run: npm run eval:build-set
import { writeFileSync } from "fs";
import { join } from "path";

interface Dataset {
  /** The name the TSV's source column and eval/README.md use. */
  name: string;
  id: string;
  split: string;
  /** The row's Mandarin and Cantonese text. */
  pair: (row: Record<string, unknown>) => { zh: unknown; yue: unknown };
}

const DATASETS: readonly Dataset[] = [
  // zh is simplified, yue traditional. One split only.
  { name: "HKAllen", id: "HKAllen/cantonese-chinese-parallel-corpus", split: "train", pair: (row) => ({ zh: row.zh, yue: row.yue }) },
  // zh is traditional; some zh texts are really Cantonese (CANTONESE_ONLY drops them). Held-out split.
  {
    name: "raptorkwok-base",
    id: "raptorkwok/cantonese-chinese-parallel-corpus-base",
    split: "test",
    pair: (row) => row.translation as { zh: unknown; yue: unknown },
  },
];

const PAIRS_PER_DATASET = 100;
/** Random blocks fetched per dataset; the pairs are drawn from the rows that pass the filters. */
const BLOCKS_PER_DATASET = 10;
/** The rows API's maximum page size. */
const ROWS_PER_BLOCK = 100;
const SEED = 20261101;
/** Sentence length bounds, in characters: long enough to need translating, short enough to read. */
const MIN_LENGTH = 4;
const MAX_LENGTH = 60;
/** Characters only Cantonese writes: a "Mandarin" side containing one is mislabelled Cantonese. */
const CANTONESE_ONLY = /[嘅係咗喺冇佢啲嚟唔睇乜噉嗰哋咩嘢Ｄ啱搵揾畀俾喎㗎咁]/u;

const API = "https://datasets-server.huggingface.co";
const OUTPUT_PATH = join(__dirname, "../eval/test-set.tsv");

/** mulberry32: a small seeded PRNG, so the sample is reproducible. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function usable(zh: unknown, yue: unknown): zh is string {
  if (typeof zh !== "string" || typeof yue !== "string" || zh === yue) return false;
  const lengths = [Array.from(zh).length, Array.from(yue).length];
  return lengths.every((n) => n >= MIN_LENGTH && n <= MAX_LENGTH) && !/[\t\r\n]/.test(zh + yue) && !CANTONESE_ONLY.test(zh);
}

async function sample(dataset: Dataset, next: () => number): Promise<string[]> {
  const query = `dataset=${encodeURIComponent(dataset.id)}&config=default&split=${dataset.split}`;
  const size = await getJson(`${API}/size?dataset=${encodeURIComponent(dataset.id)}`);
  const rowCount: number = size.size.splits.find((s: { split: string }) => s.split === dataset.split).num_rows;

  const candidates: { row: number; zh: string; yue: string }[] = [];
  for (let block = 0; block < BLOCKS_PER_DATASET; block++) {
    const offset = Math.floor(next() * Math.max(1, rowCount - ROWS_PER_BLOCK));
    const page = await getJson(`${API}/rows?${query}&offset=${offset}&length=${ROWS_PER_BLOCK}`);
    for (const { row_idx, row } of page.rows) {
      const { zh, yue } = dataset.pair(row);
      if (usable(zh, yue)) candidates.push({ row: row_idx, zh, yue: yue as string });
    }
  }
  // Seeded Fisher–Yates shuffle, then the first PAIRS_PER_DATASET distinct rows.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const seen = new Set<number>();
  const picked = candidates.filter(({ row }) => !seen.has(row) && seen.add(row)).slice(0, PAIRS_PER_DATASET);
  if (picked.length < PAIRS_PER_DATASET) throw new Error(`${dataset.name}: only ${picked.length} usable pairs`);
  return picked.map(({ row, zh, yue }) => [dataset.name, `${dataset.split}:${row}`, zh, yue].join("\t"));
}

async function main(): Promise<void> {
  const next = random(SEED);
  const lines = ["source\trow\tzh\tyue"];
  for (const dataset of DATASETS) lines.push(...(await sample(dataset, next)));
  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n");
  console.log(`Wrote ${lines.length - 1} pairs to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
