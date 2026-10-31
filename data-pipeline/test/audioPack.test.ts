// Syllable audio pack (spec §4.4): re-encoded clips concatenated into syllables.pack, indexed by syllables.json.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDIO_BITRATE_BPS, AUDIO_SAMPLE_RATE, pack, SILENCE_THRESHOLD_DB, type SyllableIndex } from "../src/build/audioPack";

const FIXTURE_AUDIO_DIR = join(import.meta.dirname, "../fixtures/audio");
const FIXTURE_SYLLABLES = ["aa1", "faan6", "sik6"];

/** jyutping → path of every fixture clip, deliberately inserted out of order. */
const fixtureClips = (): Map<string, string> =>
  new Map(["sik6", "aa1", "faan6"].map((syllable) => [syllable, join(FIXTURE_AUDIO_DIR, `${syllable}.mp3`)]));

function outPaths(): { dir: string; packPath: string; indexPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "canto-audio-test-"));
  return { dir, packPath: join(dir, "syllables.pack"), indexPath: join(dir, "syllables.json") };
}

interface Probe {
  codec: string;
  channels: number;
  sampleRate: number;
  bitRate: number;
  duration: number;
}

function ffprobe(path: string): Probe {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate,bit_rate:format=duration", "-of", "json", path],
    { encoding: "utf8" },
  );
  const { streams, format } = JSON.parse(out) as {
    streams: { codec_name: string; channels: number; sample_rate: string; bit_rate: string }[];
    format: { duration: string };
  };
  expect(streams).toHaveLength(1);
  const [s] = streams;
  return { codec: s.codec_name, channels: s.channels, sampleRate: Number(s.sample_rate), bitRate: Number(s.bit_rate), duration: Number(format.duration) };
}

/**
 * Most audio allowed before the first / after the last sample above SILENCE_THRESHOLD_DB in a decoded
 * slice. Measured on all 3,902 packed real clips (2026-10-30): at most 18.2 ms lead (waau1, whose faint
 * -60..-50 dB pre-onset is kept on purpose) and 6.1 ms tail (gwik3); the 3 fixtures are at most 1.1 ms.
 * Untrimmed clips have ~95 ms.
 */
const EDGE_SILENCE_TOLERANCE_MS = 20;

/** A slice decoded to mono float PCM at AUDIO_SAMPLE_RATE (ffmpeg applies the LAME header's encoder delay and padding). */
function decodePcm(path: string): Float32Array {
  const bytes = execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", path, "-ac", "1", "-ar", String(AUDIO_SAMPLE_RATE), "-f", "f32le", "pipe:1"]);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

/** Milliseconds of audio before the first and after the last sample louder than `thresholdDb`. */
function edgeSilenceMs(pcm: Float32Array, thresholdDb: number): { lead: number; tail: number } {
  const threshold = 10 ** (thresholdDb / 20);
  const loud = (x: number): boolean => Math.abs(x) > threshold;
  const first = pcm.findIndex(loud);
  let last = pcm.length - 1;
  while (last >= 0 && !loud(pcm[last])) last--;
  expect(first).toBeGreaterThanOrEqual(0);
  const toMs = (samples: number): number => (samples / AUDIO_SAMPLE_RATE) * 1000;
  return { lead: toMs(first), tail: toMs(pcm.length - 1 - last) };
}

describe("pack", () => {
  it("writes syllables.pack and a sorted syllables.json whose [offset, length] pairs tile the pack exactly", async () => {
    const { packPath, indexPath } = outPaths();
    const result = await pack(fixtureClips(), { packPath, indexPath });

    const bytes = readFileSync(packPath);
    const text = readFileSync(indexPath, "utf8");
    const index = JSON.parse(text) as SyllableIndex;
    expect(Object.keys(index)).toEqual(FIXTURE_SYLLABLES);
    expect(result.syllables).toEqual(FIXTURE_SYLLABLES);
    expect(result.index).toEqual(index);
    expect(result.packBytes).toBe(bytes.length);

    let expectedOffset = 0;
    for (const syllable of FIXTURE_SYLLABLES) {
      const [offset, length] = index[syllable];
      expect(offset).toBe(expectedOffset);
      expect(length).toBeGreaterThan(0);
      expectedOffset += length;
    }
    expect(expectedOffset).toBe(bytes.length);
  });

  it("slices out as independently playable 32 kbps mono MP3s at one sample rate", async () => {
    const { dir, packPath, indexPath } = outPaths();
    const { index } = await pack(fixtureClips(), { packPath, indexPath });
    const bytes = readFileSync(packPath);
    for (const [syllable, [offset, length]] of Object.entries(index)) {
      const slice = join(dir, `${syllable}.slice.mp3`);
      writeFileSync(slice, bytes.subarray(offset, offset + length));
      const probe = ffprobe(slice);
      expect(probe).toMatchObject({ codec: "mp3", channels: 1, sampleRate: AUDIO_SAMPLE_RATE, bitRate: AUDIO_BITRATE_BPS });
      expect(probe.duration).toBeGreaterThan(0);
    }
  });

  it("trims each slice so it starts and ends with sound", async () => {
    const { dir, packPath, indexPath } = outPaths();
    const { index } = await pack(fixtureClips(), { packPath, indexPath });
    const bytes = readFileSync(packPath);
    for (const [syllable, [offset, length]] of Object.entries(index)) {
      const slice = join(dir, `${syllable}.slice.mp3`);
      writeFileSync(slice, bytes.subarray(offset, offset + length));
      const { lead, tail } = edgeSilenceMs(decodePcm(slice), SILENCE_THRESHOLD_DB);
      expect(lead, `${syllable} lead-in`).toBeLessThanOrEqual(EDGE_SILENCE_TOLERANCE_MS);
      expect(tail, `${syllable} tail`).toBeLessThanOrEqual(EDGE_SILENCE_TOLERANCE_MS);
    }
  });

  it("is deterministic: the same clips give byte-identical outputs", async () => {
    const a = outPaths();
    const b = outPaths();
    await pack(fixtureClips(), a);
    await pack(fixtureClips(), b);
    expect(readFileSync(a.packPath).equals(readFileSync(b.packPath))).toBe(true);
    expect(readFileSync(a.indexPath, "utf8")).toBe(readFileSync(b.indexPath, "utf8"));
  });

  it("fails with a clear error when ffmpeg is missing, writing nothing", async () => {
    const { dir, packPath, indexPath } = outPaths();
    await expect(pack(fixtureClips(), { packPath, indexPath }, { ffmpeg: join(dir, "no-such-ffmpeg") })).rejects.toThrow(
      /ffmpeg not found/,
    );
    expect(readdirSync(dir)).toEqual([]);
  });

  it("keeps the previous outputs and leaves no temp files when a clip fails to encode", async () => {
    const { dir, packPath, indexPath } = outPaths();
    writeFileSync(packPath, "old pack");
    writeFileSync(indexPath, "{}");
    const notAudio = join(dir, "zi6.mp3");
    writeFileSync(notAudio, "not audio");
    const clips = fixtureClips().set("zi6", notAudio);
    await expect(pack(clips, { packPath, indexPath })).rejects.toThrow(/zi6/);
    expect(readFileSync(packPath, "utf8")).toBe("old pack");
    expect(readFileSync(indexPath, "utf8")).toBe("{}");
    expect(readdirSync(dir).sort()).toEqual(["syllables.json", "syllables.pack", "zi6.mp3"]);
  });

  it("rejects a key that is not one toned Jyutping syllable", async () => {
    const { packPath, indexPath } = outPaths();
    const clips = new Map([["Sik6", join(FIXTURE_AUDIO_DIR, "sik6.mp3")]]);
    await expect(pack(clips, { packPath, indexPath })).rejects.toThrow(/"Sik6"/);
    expect(existsSync(packPath)).toBe(false);
  });
});
