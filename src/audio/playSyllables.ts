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
 * Used when no Cantonese voice is found (see cantoneseVoice).
 * TODO: spec §7 shows download steps when no Cantonese voice is installed (speakSentence reports
 * missingVoice; the Translate screen, P3-T11, shows them).
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

/** Takes over playback: stops what is sounding and returns a check for whether this play is still the latest. */
function startPlay(): () => boolean {
  const play = ++latestPlay;
  stopSounding?.();
  return () => play === latestPlay;
}

/** Stops whatever is playing or speaking, without starting anything. */
export function stopPlayback(): void {
  startPlay();
}

/** Languages iOS reports for its Cantonese voices: recent versions yue-HK, older zh-HK (research §5.1). */
const CANTONESE_LANGUAGES: readonly string[] = ["yue-HK", "zh-HK"];

let ttsVoice: Promise<string | undefined> | null = null;

/** The first installed Cantonese voice's identifier (looked up once), or undefined when there is none. */
export function cantoneseVoice(): Promise<string | undefined> {
  ttsVoice ??= Speech.getAvailableVoicesAsync().then(
    (voices) => voices.find((v) => CANTONESE_LANGUAGES.includes(v.language))?.identifier,
    (e) => {
      ttsVoice = null;
      console.warn("TTS voices not listed", e);
      return undefined;
    },
  );
  return ttsVoice;
}

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

/** Speaks text (a character, for the fallback); resolves when speech ends, however it ends. */
function speak(text: string, voice?: string): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => void Speech.stop().catch(() => {});
    stopSounding = stop;
    const end = () => {
      if (stopSounding === stop) stopSounding = null;
      resolve();
    };
    try {
      Speech.speak(text, { language: TTS_LANGUAGE, voice, onDone: end, onStopped: end, onError: () => end() });
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
  const isLatest = startPlay();
  const chars = Array.from(text).filter((c) => HAN.test(c));
  const charFor = (i: number) => (chars.length === syllables.length ? chars[i] : undefined);
  let usedTts = false;
  // Every clip is ready before the first plays, so no slicing happens between syllables.
  const [uris, voice] = await Promise.all([Promise.all(syllables.map(clipOrNull)), cantoneseVoice(), setUpAudio()]);
  for (const [i, syllable] of syllables.entries()) {
    if (!isLatest()) break;
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
    if (char === undefined || !isLatest()) continue;
    usedTts = true;
    await speak(char, voice);
  }
  return { usedTts };
}

/** The entry screen's TTS button: iOS speaks the whole text with the Cantonese voice, falling back to TTS_LANGUAGE. */
export async function speakTts(text: string): Promise<void> {
  const isLatest = startPlay();
  const [voice] = await Promise.all([cantoneseVoice(), setUpAudio()]);
  if (isLatest()) await speak(text, voice);
}
