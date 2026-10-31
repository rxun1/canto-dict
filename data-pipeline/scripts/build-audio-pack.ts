// Builds assets/syllables.pack + assets/syllables.json (git-ignored: the clips are personal use only)
// from the pinned words.hk syllable clips, until cli.ts runs the full build (P1-T17).
// Run: cd data-pipeline && npx tsx scripts/build-audio-pack.ts
import { join } from "node:path";
import { BYTES_PER_MB, pack } from "../src/build/audioPack";
import { fetchWordshkClips } from "../src/sources/wordshkAudio";

const ASSETS_DIR = join(import.meta.dirname, "../../assets");

const started = performance.now();
const clips = await fetchWordshkClips();
const downloaded = performance.now();
const result = await pack(clips, { packPath: join(ASSETS_DIR, "syllables.pack"), indexPath: join(ASSETS_DIR, "syllables.json") });
const seconds = (from: number, to: number): string => ((to - from) / 1000).toFixed(1);
console.log(
  `Packed ${result.syllables.length} clips into ${(result.packBytes / BYTES_PER_MB).toFixed(2)} MB (${result.packBytes} bytes) in ` +
    `${seconds(downloaded, performance.now())} s (clips ready in ${seconds(started, downloaded)} s)`,
);
