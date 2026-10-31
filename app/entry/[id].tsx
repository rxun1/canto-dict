// Entry screen (spec §5.2): headword, readings with rank tags, the Mandarin line, a word's characters
// (each linking to its own entry), then definitions by sense with their examples.
// 🔊 plays a reading or example in real-person syllables; a TTS button after the headword has iOS speak
// the whole word. ☆ and history are P2-T10.
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { playSyllables, speakTts } from "../../src/audio/playSyllables";
import type { Definition, Entry, Example, Reading, ReadingRank } from "../../src/db/entries";
import { useDb } from "../../src/db/expoDb";
import { YUE_GLOSS_LABEL, type MandarinLine } from "../../src/dictionary/mandarinLine";
import { partOfSpeechSimp } from "../../src/dictionary/partOfSpeech";
import { useEntry, type WordChar } from "../../src/dictionary/useEntry";

const MANDARIN_LABEL = "普通话";
const MANDARIN_SEPARATOR = "、";
const MISSING = "找不到这个词条";
const LOAD_FAILED = "词条加载失败";
const PLAY_LABEL = "播放";
/** Shown beside 🔊 once a syllable with no clip was spoken by TTS (spec §7). */
const TTS_TAG = "TTS";
const SYLLABLE_SEPARATOR = /\s+/;
const TTS_BUTTON = "TTS";

const RANK_TAGS: Record<ReadingRank, string> = {
  default: "首选",
  common: "常用",
  rare: "罕用",
  obsolete: "旧读",
  variant: "异读",
};

/** Definition group headings by source; another source shows its own name. */
const SOURCE_HEADINGS: Record<string, string> = { "wordshk-dump": "粤典 words.hk", moe: "教育部国语辞典" };

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useEntry(useDb(), Number(id));

  if (state.status === "loading") return <View style={styles.screen} />;
  if (state.status === "missing" || state.status === "error") {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.missing}>{state.status === "missing" ? MISSING : LOAD_FAILED}</Text>
      </View>
    );
  }
  const { entry, mandarin, chars } = state;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.headword}>
        <Text style={styles.simp}>{entry.simp}</Text>
        {entry.trad !== entry.simp && <Text style={styles.trad}>{entry.trad}</Text>}
        <TextButton
          label={TTS_BUTTON}
          accessibilityLabel={`${TTS_BUTTON} ${PLAY_LABEL} ${entry.trad}`}
          onPress={() => speakTts(entry.trad)}
        />
      </View>
      <View style={styles.readings}>
        {entry.readings.map((reading) => (
          <ReadingRow key={reading.jyutping} reading={reading} text={entry.trad} />
        ))}
      </View>
      {mandarin !== null && <Text style={styles.mandarin}>{mandarinText(mandarin)}</Text>}
      {chars.length > 0 && <WordChars chars={chars} />}
      <Definitions entry={entry} />
    </ScrollView>
  );
}

function mandarinText(line: MandarinLine): string {
  switch (line.source) {
    case "mandarin":
      return `${MANDARIN_LABEL}：${line.words.map((w) => w.simp).join(MANDARIN_SEPARATOR)}`;
    case "zho":
      return `${MANDARIN_LABEL}：${line.simp}`;
    case "yue":
      return `${YUE_GLOSS_LABEL}：${line.simp}`;
  }
}

/**
 * 🔊: plays the Jyutping's syllables; `text` is the characters TTS speaks for a syllable with no clip.
 * TTS reads the character, not the Jyutping, so a polyphonic one (行 under hong4) may come out in
 * another of its readings.
 */
function AudioButton({ jyutping, text }: { jyutping: string; text: string }) {
  const [usedTts, setUsedTts] = useState(false);
  const play = async () => setUsedTts((await playSyllables(jyutping.split(SYLLABLE_SEPARATOR), text)).usedTts);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${PLAY_LABEL} ${jyutping}`}
        hitSlop={8}
        onPress={play}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.audioIcon}>🔊</Text>
      </Pressable>
      {usedTts && (
        <Text style={styles.tag} testID="tts-tag">
          {TTS_TAG}
        </Text>
      )}
    </>
  );
}

/** A compact tag-like button (TTS). */
function TextButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={[styles.tag, styles.textButton]}>{label}</Text>
    </Pressable>
  );
}

function ReadingRow({ reading, text }: { reading: Reading; text: string }) {
  return (
    <View style={styles.reading} testID={`reading-${reading.jyutping}`}>
      <Text style={styles.readingText}>{reading.jyutping}</Text>
      {reading.rank !== null && (
        <Text style={styles.tag} testID="rank-tag">
          {RANK_TAGS[reading.rank]}
        </Text>
      )}
      <AudioButton jyutping={reading.jyutping} text={text} />
    </View>
  );
}

function WordChars({ chars }: { chars: WordChar[] }) {
  const router = useRouter();
  return (
    <View style={styles.chars} testID="chars">
      {chars.map((c, i) => {
        const { id } = c;
        if (id === null) {
          return (
            <Text key={i} style={[styles.char, styles.charUnlinked]}>
              {c.simp}
            </Text>
          );
        }
        return (
          <Pressable
            key={i}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: "/entry/[id]", params: { id: String(id) } })}
            style={({ pressed }) => [styles.charLink, pressed && styles.pressed]}
          >
            <Text style={[styles.char, styles.charLinked]}>{c.simp}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Consecutive definitions from one source (the pipeline writes each source's senses together). */
function groupBySource(definitions: Definition[]): Definition[][] {
  const groups: Definition[][] = [];
  for (const d of definitions) {
    const last = groups[groups.length - 1];
    if (last && last[0].source === d.source) last.push(d);
    else groups.push([d]);
  }
  return groups;
}

function Definitions({ entry }: { entry: Entry }) {
  const groups = groupBySource(entry.definitions);
  // Examples belong to words.hk senses; any whose sense has no words.hk definition are listed last.
  const yueSenses = new Set(entry.definitions.filter((d) => d.yue !== null).map((d) => d.sense));
  const orphans = entry.examples.filter((x) => !yueSenses.has(x.sense));
  return (
    <>
      {groups.map((group) => (
        <View key={group[0].source} style={styles.section}>
          <Text style={styles.sectionHeading}>{SOURCE_HEADINGS[group[0].source] ?? group[0].source}</Text>
          {group.map((d) => (
            <View key={d.sense} style={styles.sense} testID={`sense-${d.source}-${d.sense}`}>
              <Text style={styles.definition}>
                <Text style={styles.senseNumber}>{d.sense}. </Text>
                {d.pos !== null && (
                  <Fragment>
                    <Text style={styles.pos}>{partOfSpeechSimp(d.pos)}</Text>{" "}
                  </Fragment>
                )}
                {d.yueSimp ?? d.yue ?? d.zhoSimp ?? d.zho}
              </Text>
              {d.yue !== null && entry.examples.filter((x) => x.sense === d.sense).map((x, i) => <ExampleRow key={i} example={x} />)}
            </View>
          ))}
        </View>
      ))}
      {orphans.length > 0 && (
        <View style={styles.section}>
          {orphans.map((x, i) => (
            <ExampleRow key={i} example={x} />
          ))}
        </View>
      )}
    </>
  );
}

function ExampleRow({ example }: { example: Example }) {
  return (
    <View style={styles.example}>
      <View style={styles.exampleLine}>
        <Text style={styles.exampleText}>{example.yueSimp}</Text>
        {example.jyutping !== null && <AudioButton jyutping={example.jyutping} text={example.yueTrad} />}
      </View>
      {example.jyutping !== null && <Text style={styles.exampleJyutping}>{example.jyutping}</Text>}
      {example.zhoSimp !== null && <Text style={styles.exampleMandarin}>{example.zhoSimp}</Text>}
    </View>
  );
}

const PADDING = 16;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  centered: { alignItems: "center", justifyContent: "center" },
  missing: { fontSize: 17, color: PlatformColor("secondaryLabel") },
  content: { padding: PADDING, gap: 12 },
  headword: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  simp: { fontSize: 44, color: PlatformColor("label") },
  trad: { fontSize: 22, color: PlatformColor("secondaryLabel") },
  readings: { gap: 6 },
  reading: { flexDirection: "row", alignItems: "center", gap: 8 },
  readingText: { fontSize: 20, color: PlatformColor("label") },
  tag: {
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    color: PlatformColor("secondaryLabel"),
    backgroundColor: PlatformColor("tertiarySystemFill"),
  },
  textButton: { color: PlatformColor("link"), backgroundColor: PlatformColor("secondarySystemFill") },
  audioIcon: { fontSize: 18 },
  mandarin: { fontSize: 17, color: PlatformColor("label") },
  chars: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  charLink: { borderRadius: 8, backgroundColor: PlatformColor("secondarySystemFill") },
  pressed: { opacity: 0.5 },
  char: { fontSize: 22, paddingHorizontal: 10, paddingVertical: 4 },
  charLinked: { color: PlatformColor("link") },
  charUnlinked: { color: PlatformColor("secondaryLabel") },
  section: { gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: PlatformColor("separator") },
  sectionHeading: { fontSize: 13, color: PlatformColor("secondaryLabel") },
  sense: { gap: 6 },
  definition: { fontSize: 17, color: PlatformColor("label") },
  senseNumber: { color: PlatformColor("secondaryLabel") },
  pos: { color: PlatformColor("secondaryLabel") },
  example: { marginLeft: PADDING, gap: 2 },
  exampleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  exampleText: { flexShrink: 1, fontSize: 16, color: PlatformColor("label") },
  exampleJyutping: { fontSize: 14, color: PlatformColor("secondaryLabel") },
  exampleMandarin: { fontSize: 14, color: PlatformColor("secondaryLabel") },
});
