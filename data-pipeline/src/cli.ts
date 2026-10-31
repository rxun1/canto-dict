// The build runner (spec §4): download → parse → merge → validate → build. Validation runs before any
// asset is written, so a failed check keeps the previous canto.db, audio pack and report. A failure after
// validate (e.g. pack() over MAX_PACK_BYTES) can leave a new canto.db beside the old pack and report.
// npm run data:build   → assets/canto.db, assets/syllables.{pack,json}, build-report.html (real sources)
// npm run data:fixture → assets/test/canto.fixture.db from fixtures/ (no network, no minimums)
import { statSync } from "node:fs";
import { join } from "node:path";
import { formatMb as mb, pack, type PackOutputs } from "./build/audioPack";
import { REPORT_PATH, writeReport } from "./build/report";
import { FIXTURE_DB_PATH, writeDb } from "./build/writeDb";
import { fixtureInputs } from "./fixtureInputs";
import { loadMergeInputs } from "./merge/load";
import { merge } from "./merge/merge";
import type { MergeInputs } from "./merge/types";
import { fetchWordshkClips } from "./sources/wordshkAudio";
import { MIN_SOURCE_ROWS, NO_MINIMUMS, sourceRows, validate, type SourceRows } from "./validate";

export const STEPS = ["download", "parse", "merge", "validate", "build"] as const;

export type Step = (typeof STEPS)[number];

const ASSETS_DIR = join(import.meta.dirname, "../../assets");

const FLAGS = ["--help", "--fixture"] as const;

export function helpText(): string {
  return [
    `Usage: npm run data:build -- [${FLAGS.join("] [")}]`,
    "",
    "  --fixture  build assets/test/canto.fixture.db from data-pipeline/fixtures/ (no network)",
    "",
    "Steps (run in order):",
    ...STEPS.map((step, i) => `  ${i + 1}. ${step}`),
  ].join("\n");
}

export interface BuildConfig {
  /** Downloads (or reads from the cache) and parses every source. */
  readonly loadInputs: () => Promise<MergeInputs>;
  readonly minimums: SourceRows;
  readonly dbPath: string;
  /** The audio pack and build report; the fixture build has neither. */
  readonly audio?: {
    /** Downloads (or reads from the cache) the syllable clips: jyutping → file. */
    readonly loadClips: () => Promise<ReadonlyMap<string, string>>;
    readonly outputs: PackOutputs;
    readonly reportPath: string;
  };
}

export interface BuildSummary {
  readonly entries: number;
  readonly dbBytes: number;
  /** Size of syllables.pack, 0 when the build has no audio. */
  readonly packBytes: number;
}

/** The real build (fixture = false) or the fixture build. */
export function defaultConfig(fixture: boolean): BuildConfig {
  if (fixture) return { loadInputs: async () => fixtureInputs(), minimums: NO_MINIMUMS, dbPath: FIXTURE_DB_PATH };
  return {
    loadInputs: loadMergeInputs,
    minimums: MIN_SOURCE_ROWS,
    dbPath: join(ASSETS_DIR, "canto.db"),
    audio: {
      loadClips: fetchWordshkClips,
      outputs: { packPath: join(ASSETS_DIR, "syllables.pack"), indexPath: join(ASSETS_DIR, "syllables.json") },
      reportPath: REPORT_PATH,
    },
  };
}

/** Runs every step; throws on the first failure. Nothing is written before validate() passes. */
export async function build(config: BuildConfig): Promise<BuildSummary> {
  const started = performance.now();
  const step = (name: string): void => console.log(`[${((performance.now() - started) / 1000).toFixed(1)} s] ${name}`);

  step("download + parse sources");
  const sources = await config.loadInputs();
  // Count the clips now: validate needs the count, and pack() writes, so it must wait for validate.
  let clips: ReadonlyMap<string, string> = new Map();
  if (config.audio !== undefined) {
    step("download syllable clips");
    clips = await config.audio.loadClips();
  }

  step("merge");
  const { entries, stats } = merge(sources);

  step("validate");
  const warnings = validate({ sources, entries, audioClips: clips.size }, config.minimums);
  for (const warning of warnings) console.warn(`warning: ${warning}`);

  step(`build: ${config.dbPath}`);
  writeDb(config.dbPath, entries);
  const dbBytes = statSync(config.dbPath).size;
  let packBytes = 0;
  if (config.audio !== undefined) {
    const { outputs, reportPath } = config.audio;
    step(`build: ${outputs.packPath}`);
    const audio = await pack(clips, outputs);
    packBytes = audio.packBytes;
    step(`build: ${reportPath}`);
    await writeReport({ sourceRows: sourceRows(sources), minimums: config.minimums, entries, stats, audio, dbBytes, warnings }, reportPath);
  }
  step(`done: ${entries.length.toLocaleString("en-US")} entries, canto.db ${mb(dbBytes)}` + (config.audio ? `, syllables.pack ${mb(packBytes)}` : ""));
  return { entries: entries.length, dbBytes, packBytes };
}

/** Parses the flags and runs the build; returns the process exit code (0 ok, 1 bad flags or a failed step). */
export async function main(args: readonly string[], configFor: (fixture: boolean) => BuildConfig = defaultConfig): Promise<number> {
  const unknown = args.filter((arg) => !(FLAGS as readonly string[]).includes(arg));
  if (unknown.length > 0) {
    console.error(`unknown argument: ${unknown.join(" ")}\n\n${helpText()}`);
    return 1;
  }
  if (args.includes("--help")) {
    console.log(helpText());
    return 0;
  }
  try {
    await build(configFor(args.includes("--fixture")));
    return 0;
  } catch (error) {
    console.error(`build failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
