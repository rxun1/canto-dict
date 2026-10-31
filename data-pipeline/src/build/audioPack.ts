// Syllable audio pack (spec §4.4). Every clip is re-encoded by ffmpeg to one format (32 kbps mono
// MP3 at one sample rate) with its leading and trailing silence trimmed, and the encoded files are
// concatenated into syllables.pack; syllables.json maps each jyutping to its [offset, length] in it.
// Each slice is a complete MP3 file with its own LAME/Xing header, so it plays on its own. Both
// outputs are written to temporary files and only then renamed over the old ones, so a failed build
// keeps the previous pack.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TONED_SYLLABLE } from "../../../src/jyutping/pattern";
import { byCodeUnits } from "../compare";
import { mapConcurrent } from "../concurrency";
import { tempPathFor } from "../writeFileAtomic";

const run = promisify(execFile);

/** Output bitrate (spec §4.4: 32 kbps). The source clips are already 32 kbps, so this costs no extra bytes per second. */
export const AUDIO_BITRATE_BPS = 32_000;

/** Output sample rate: that of nearly all words.hk clips (2 of 3,902 are 44.1 kHz), so most are not resampled. */
export const AUDIO_SAMPLE_RATE = 22_050;

const AUDIO_CHANNELS = 1;

/**
 * Peak level below which leading and trailing audio counts as silence and is cut. The words.hk clips
 * open with ~100 ms (up to 200 ms) of near-digital silence that ends abruptly: measured on all 3,902
 * clips, the lead-in ends within a few ms whether the threshold is -60 or -50 dB, while -40 dB and up
 * starts eating quiet onsets (hai6 loses 22 ms of its h-). -50 dB removes the blank lead-in and tail
 * and keeps every consonant onset.
 */
export const SILENCE_THRESHOLD_DB = -50;

/** A trimmed clip shorter than this means trimming ate the syllable (or the clip was silent); the shortest real one is ~140 ms. */
export const MIN_CLIP_SECONDS = 0.05;

/** Trims silence at the start, then (reversed) at the end, using per-sample peak detection. */
const TRIM_SILENCE = `silenceremove=start_periods=1:start_threshold=${SILENCE_THRESHOLD_DB}dB:detection=peak`;
const AUDIO_FILTER = [TRIM_SILENCE, "areverse", TRIM_SILENCE, "areverse"].join(",");

/** Decimal megabyte, the unit sizes are reported in. */
export const BYTES_PER_MB = 1_000_000;

/**
 * Largest syllables.pack (10 MB) the build accepts: the app bundles it, and the full words.hk set packs to
 * ~9.7 MB (spec §4.4), so a bigger pack means the clip set or the encoding changed unexpectedly.
 */
export const MAX_PACK_BYTES = 10 * BYTES_PER_MB;

/** jyutping → [byte offset, byte length] of its clip in syllables.pack. */
export type SyllableIndex = Record<string, [offset: number, length: number]>;

export interface PackOutputs {
  packPath: string;
  indexPath: string;
}

export interface PackOptions {
  /** ffmpeg / ffprobe executables (default: found on PATH). */
  ffmpeg?: string;
  ffprobe?: string;
  /** Size limit of syllables.pack (default MAX_PACK_BYTES); tests pass a tiny one. */
  maxPackBytes?: number;
}

export interface PackResult {
  /** The packed syllables, sorted: the build report lists the attested syllables missing from it. */
  syllables: string[];
  index: SyllableIndex;
  packBytes: number;
}

/** ffmpeg or ffprobe is not installed. */
class MissingToolError extends Error {}

/** Runs a tool, turning "not installed" into a clear error. */
async function runTool(tool: string, args: string[]): Promise<string> {
  try {
    return (await run(tool, args, { encoding: "utf8" })).stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new MissingToolError(`${tool} not found: the audio pack needs ffmpeg and ffprobe on PATH (macOS: brew install ffmpeg)`);
    }
    throw error;
  }
}

/** Re-encodes one clip into `out` and returns its duration in seconds. */
async function encodeClip(syllable: string, input: string, out: string, ffmpeg: string, ffprobe: string): Promise<number> {
  try {
    await runTool(ffmpeg, [
      ...["-nostdin", "-hide_banner", "-v", "error", "-y", "-i", input],
      ...["-map", "0:a:0", "-map_metadata", "-1", "-af", AUDIO_FILTER],
      ...["-c:a", "libmp3lame", "-b:a", String(AUDIO_BITRATE_BPS), "-ac", String(AUDIO_CHANNELS), "-ar", String(AUDIO_SAMPLE_RATE)],
      // No ID3 tag; bitexact keeps the ffmpeg version string out of the header, so the bytes are reproducible.
      ...["-id3v2_version", "0", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "mp3", out],
    ]);
    const duration = Number(await runTool(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]));
    if (!(duration >= MIN_CLIP_SECONDS)) {
      throw new Error(`only ${duration} s of audio is left after trimming silence (minimum ${MIN_CLIP_SECONDS} s)`);
    }
    return duration;
  } catch (error) {
    if (error instanceof MissingToolError) throw error;
    const detail = (error as { stderr?: string }).stderr?.trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`audio pack: cannot encode ${syllable} (${input}): ${detail}`, { cause: error });
  }
}

/**
 * Re-encodes every clip (jyutping → audio file) and writes syllables.pack (the encoded clips back to
 * back, in sorted jyutping order) and syllables.json (sorted keys, so the output is deterministic).
 * Throws, writing nothing, if a key is not one toned syllable, ffmpeg/ffprobe is missing, a clip
 * fails to encode or the pack would exceed the size limit.
 */
export async function pack(clips: ReadonlyMap<string, string>, outputs: PackOutputs, options: PackOptions = {}): Promise<PackResult> {
  const syllables = [...clips.keys()].sort(byCodeUnits);
  const bad = syllables.find((s) => !TONED_SYLLABLE.test(s));
  if (bad !== undefined) throw new Error(`audio pack: key "${bad}" is not one toned Jyutping syllable`);
  const ffmpeg = options.ffmpeg ?? "ffmpeg";
  const ffprobe = options.ffprobe ?? "ffprobe";
  const maxPackBytes = options.maxPackBytes ?? MAX_PACK_BYTES;

  const work = await mkdtemp(join(tmpdir(), "canto-audio-"));
  const packTemp = tempPathFor(outputs.packPath);
  const indexTemp = tempPathFor(outputs.indexPath);
  try {
    const encoded = await mapConcurrent(syllables, async (syllable) => {
      const out = join(work, `${syllable}.mp3`);
      await encodeClip(syllable, clips.get(syllable) ?? "", out, ffmpeg, ffprobe);
      return readFile(out);
    });
    const index: SyllableIndex = {};
    let offset = 0;
    syllables.forEach((syllable, i) => {
      index[syllable] = [offset, encoded[i].length];
      offset += encoded[i].length;
    });
    if (offset > maxPackBytes) {
      throw new Error(`audio pack: ${syllables.length} clips encode to ${offset} bytes, over the ${maxPackBytes}-byte limit`);
    }
    await writeFile(packTemp, Buffer.concat(encoded));
    await writeFile(indexTemp, `${JSON.stringify(index)}\n`);
    // The two renames are not atomic together: a crash between them leaves a new pack with the old index until the next build.
    await rename(packTemp, outputs.packPath);
    await rename(indexTemp, outputs.indexPath);
    return { syllables, index, packBytes: offset };
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(packTemp, { force: true });
    await rm(indexTemp, { force: true });
  }
}
