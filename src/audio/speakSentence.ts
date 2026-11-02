// Reads a translation aloud (spec §6.4). The default is the iOS Cantonese voice speaking the whole text;
// the toggle plays real-person syllables in sequence from the displayed Jyutping.
import { cantoneseVoice, playSyllables, speakTts, stopPlayback, type PlayResult } from "./playSyllables";

export type SpeakMode = "voice" | "syllables";

/**
 * missingVoice: the voice mode found no Cantonese voice and spoke nothing (the screen shows the download
 * steps, spec §7). usedTts is set by the syllable mode only: a syllable fell back to TTS (the "TTS" tag).
 */
export type SpeakResult = { missingVoice: true } | ({ missingVoice: false } & PlayResult);

/**
 * Speaks `text` (the displayed Cantonese). `jyutping` is aligned per code point of `text`, null where a
 * character has no reading (punctuation, Latin); the syllable mode skips those.
 * The syllable mode doesn't need a voice: clips are real recordings, and only a syllable without a clip
 * falls back to TTS (TTS_LANGUAGE when no Cantonese voice is installed), so it never reports missingVoice.
 */
export async function speakSentence(
  text: string,
  jyutping: readonly (string | null)[],
  mode: SpeakMode = "voice",
): Promise<SpeakResult> {
  if (mode === "syllables") {
    const syllables = jyutping.filter((s): s is string => s !== null);
    // Only the characters with a reading, so a Han character without one (rare CJK extensions) can't break
    // playSyllables' one-to-one character match and silence the whole TTS fallback.
    const read = Array.from(text)
      .filter((_, i) => jyutping[i] != null)
      .join("");
    return { missingVoice: false, ...(await playSyllables(syllables, read)) };
  }
  // A non-Cantonese voice reading Han text would be Mandarin, so nothing is spoken (and nothing keeps playing).
  if ((await cantoneseVoice()) === undefined) {
    stopPlayback();
    return { missingVoice: true };
  }
  await speakTts(text);
  return { missingVoice: false, usedTts: false };
}
