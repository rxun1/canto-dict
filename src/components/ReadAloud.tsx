// Read-aloud for a translation (spec §6.4): 🔊 with a 语音 | 音节 toggle (iOS voice by default, or real-person
// syllables). Shows the "TTS" tag when a syllable fell back to TTS, and the download steps when no
// Cantonese voice is installed (spec §7).
import { useState } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";
import { speakSentence, type SpeakMode, type SpeakResult } from "../audio/speakSentence";
import type { Translation } from "../translate";
import { SegmentedControl, type Segment } from "./SegmentedControl";
import { tagStyle } from "./tagStyle";

const MODES: readonly Segment<SpeakMode>[] = [
  { key: "voice", label: "语音" },
  { key: "syllables", label: "音节" },
];
const SPEAK_LABEL = "朗读";
const TTS_TAG = "TTS";
/** spec §7's path (Settings → Accessibility → Spoken Content → Voices), as iOS labels it in Chinese. */
export const MISSING_VOICE_STEPS = "未安装粤语语音。请前往 设置 → 辅助功能 → 朗读内容 → 声音 → 中文 → 粤语，下载后再试。";

export function ReadAloud({ result }: { result: Translation }) {
  const [mode, setMode] = useState<SpeakMode>("voice");
  // Tied to the result it was spoken for, so a new result (or a late reply for an old one) shows no stale status.
  const [spoken, setSpoken] = useState<{ result: Translation; outcome: SpeakResult } | null>(null);
  const outcome = spoken?.result === result ? spoken.outcome : null;

  const speak = () => {
    speakSentence(result.cantonese, result.jyutping, mode).then(
      (next) => setSpoken({ result, outcome: next }),
      (e: unknown) => console.warn("Reading aloud failed", e),
    );
  };

  return (
    <View style={styles.readAloud}>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SPEAK_LABEL}
          hitSlop={8}
          onPress={speak}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.icon}>🔊</Text>
        </Pressable>
        <SegmentedControl segments={MODES} selected={mode} onSelect={setMode} />
        {outcome?.missingVoice === false && outcome.usedTts && <Text style={styles.tag}>{TTS_TAG}</Text>}
      </View>
      {outcome?.missingVoice && <Text style={styles.steps}>{MISSING_VOICE_STEPS}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  readAloud: { gap: 8 },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { fontSize: 22 },
  pressed: { opacity: 0.5 },
  tag: tagStyle,
  steps: { fontSize: 14, color: PlatformColor("secondaryLabel") },
});
