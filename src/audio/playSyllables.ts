// Plays real-person syllable clips one after another (spec §6.4: dictionary characters and words always
// use them). A syllable with no clip, or whose clip fails, is spoken by iOS TTS instead (spec §7).
// Nothing here throws: a failure is logged and the syllable is skipped. Starting a new play stops the
// one in progress.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { HAN } from "../dictionary/classify";
import { clipPath } from "./syllablePack";

/**
 * Language of the TTS fallback voice.
 * TODO: spec §6.4 picks the first installed yue-HK or zh-HK voice, and §7 shows download steps when
 * there is none; neither is done yet (this asks for zh-HK and takes whatever iOS gives).
 */
export const TTS_LANGUAGE = "zh-HK";

/** A clip that hasn't finished by now counts as failed. The longest clip is ~1.4 s; the rest is headroom for loading. */
export const MAX_CLIP_MS = 5000;

export interface PlayResult {
  /** At least one syllable fell back to TTS (the screen shows a small "TTS" tag). */
  usedTts: boolean;
}

/** Counts playSyllables calls; a play whose number is no longer the latest stops. */
let latestPlay = 0;
/** Stops the clip or speech now sounding, if any. */
let stopSounding: (() => void) | null = null;

let audioMode: Promise<void> | null = null;

/** Tapping 🔊 should be heard even with the ring/silent switch on silent. */
function setUpAudio(): Promise<void> {
  audioMode ??= setAudioModeAsync({ playsInSilentMode: true }).catch((e) => {
    audioMode = null;
    console.warn("audio mode not set", e);
  });
  return audioMode;
}

/** Plays one clip; resolves when it finishes or is stopped, rejects if it fails or takes too long. */
function playClip(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer(uri);
    let subscription: { remove(): void } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (stopSounding === stop) stopSounding = null;
      try {
        subscription?.remove();
        player.remove();
      } catch (e) {
        console.warn("player cleanup failed", e);
      }
      if (error) reject(error);
      else resolve();
    };
    const stop = () => {
      try {
        player.pause();
      } catch {
        // not loaded yet: removing it is enough
      }
      finish();
    };
    try {
      subscription = player.addListener("playbackStatusUpdate", (status) => {
        if (status.error) finish(new Error(status.error));
        else if (status.didJustFinish) finish();
      });
      timer = setTimeout(() => finish(new Error(`clip still playing after ${MAX_CLIP_MS} ms`)), MAX_CLIP_MS);
      stopSounding = stop;
      player.play();
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Speaks one character; resolves when speech ends, however it ends. */
function speak(char: string): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => void Speech.stop().catch(() => {});
    stopSounding = stop;
    const end = () => {
      if (stopSounding === stop) stopSounding = null;
      resolve();
    };
    try {
      Speech.speak(char, { language: TTS_LANGUAGE, onDone: end, onStopped: end, onError: () => end() });
    } catch (e) {
      console.warn("TTS failed", e);
      end();
    }
  });
}

/** The cached clip's URI, or null when there is none or it can't be had. */
async function clipOrNull(syllable: string): Promise<string | null> {
  try {
    return await clipPath(syllable);
  } catch (e) {
    console.warn(`clip for ${syllable} failed`, e);
    return null;
  }
}

/**
 * Plays the syllables in order, each after the previous one finishes. `text` supplies the characters for
 * the TTS fallback: its Han characters are matched to the syllables one to one, and only when their
 * counts agree (so a loanword like "rapper" leaves its syllables without a character, and silent).
 */
export async function playSyllables(syllables: readonly string[], text = ""): Promise<PlayResult> {
  const play = ++latestPlay;
  stopSounding?.();
  const chars = Array.from(text).filter((c) => HAN.test(c));
  const charFor = (i: number) => (chars.length === syllables.length ? chars[i] : undefined);
  let usedTts = false;
  // Every clip is ready before the first plays, so no slicing happens between syllables.
  const [uris] = await Promise.all([Promise.all(syllables.map(clipOrNull)), setUpAudio()]);
  for (const [i, syllable] of syllables.entries()) {
    if (play !== latestPlay) break;
    const uri = uris[i];
    if (uri !== null) {
      try {
        await playClip(uri);
        continue;
      } catch (e) {
        console.warn(`clip for ${syllable} failed`, e);
      }
    }
    const char = charFor(i);
    if (char === undefined || play !== latestPlay) continue;
    usedTts = true;
    await speak(char);
  }
  return { usedTts };
}
