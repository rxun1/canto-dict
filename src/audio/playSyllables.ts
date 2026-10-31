// Plays real-person syllable clips one after another (spec §6.4: dictionary characters and words always
// use them). A syllable with no clip, or whose clip fails, is spoken by iOS TTS instead (spec §7).
// Nothing here throws: a failure is logged and the syllable is skipped.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { HAN } from "../dictionary/classify";
import { clipPath } from "./syllablePack";

/** Language of the TTS fallback voice. */
export const TTS_LANGUAGE = "zh-HK";

export interface PlayResult {
  /** At least one syllable fell back to TTS (the screen shows a small "TTS" tag). */
  usedTts: boolean;
}

let audioMode: Promise<void> | null = null;

/** Tapping 🔊 should be heard even with the ring/silent switch on silent. */
function setUpAudio(): Promise<void> {
  audioMode ??= setAudioModeAsync({ playsInSilentMode: true }).catch((e) => {
    audioMode = null;
    console.warn("audio mode not set", e);
  });
  return audioMode;
}

/** Plays one clip; resolves when it finishes, rejects if it fails. */
function playClip(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const player = createAudioPlayer(uri);
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.didJustFinish && !status.error) return;
      subscription.remove();
      player.remove();
      if (status.error) reject(new Error(status.error));
      else resolve();
    });
    player.play();
  });
}

/** Speaks one character; resolves when speech ends, however it ends. */
function speak(char: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      Speech.speak(char, { language: TTS_LANGUAGE, onDone: resolve, onStopped: resolve, onError: () => resolve() });
    } catch (e) {
      console.warn("TTS failed", e);
      resolve();
    }
  });
}

/**
 * Plays the syllables in order, each after the previous one finishes. `text` supplies the characters for
 * the TTS fallback: its Han characters are matched to the syllables one to one, and only when their
 * counts agree (so a loanword like "rapper" leaves its syllables without a character, and silent).
 */
export async function playSyllables(syllables: readonly string[], text = ""): Promise<PlayResult> {
  const chars = Array.from(text).filter((c) => HAN.test(c));
  const charFor = (i: number) => (chars.length === syllables.length ? chars[i] : undefined);
  let usedTts = false;
  await setUpAudio();
  for (const [i, syllable] of syllables.entries()) {
    try {
      const uri = await clipPath(syllable);
      if (uri !== null) {
        await playClip(uri);
        continue;
      }
    } catch (e) {
      console.warn(`clip for ${syllable} failed`, e);
    }
    const char = charFor(i);
    if (char === undefined) continue;
    usedTts = true;
    await speak(char);
  }
  return { usedTts };
}
