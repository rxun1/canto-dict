// Licenses screen (opened from Settings): every data source in spec §4.1 with its license and a link, then
// the MoE credit and the full MoE usage notes, which the MoE requires to be kept with its data.
import { Linking, PlatformColor, ScrollView, StyleSheet, Text, View } from "react-native";
import { ROW_PADDING } from "../src/components/EntryRow";
import { MOEDICT_ATTRIBUTION, MOE_USAGE_NOTES } from "../src/licenses/moe";
import { SOURCES } from "../src/licenses/sources";

function openLink(url: string) {
  Linking.openURL(url).catch((e: unknown) => console.warn("Opening a link failed", e));
}

export default function LicensesScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {SOURCES.map((source) => (
        <View key={source.id} style={styles.source}>
          <Text style={styles.name}>{source.name}</Text>
          <Text style={styles.detail}>{source.use}</Text>
          <Text style={styles.detail} testID={`license-${source.id}`}>
            授权：{source.license}
          </Text>
          <Text style={styles.link} accessibilityRole="link" testID={`link-${source.id}`} onPress={() => openLink(source.url)}>
            {source.url}
          </Text>
        </View>
      ))}
      <View style={styles.source}>
        <Text style={styles.heading}>教育部《重編國語辭典修訂本》姓名標示</Text>
        <Text style={styles.body} selectable>
          {MOEDICT_ATTRIBUTION}
        </Text>
      </View>
      <View style={styles.source}>
        {MOE_USAGE_NOTES.map((paragraph, i) => (
          <Text key={i} style={i === 0 ? styles.heading : styles.body} selectable>
            {paragraph}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  content: { padding: ROW_PADDING, gap: 20 },
  source: { gap: 4 },
  name: { fontSize: 17, fontWeight: "600", color: PlatformColor("label") },
  heading: { fontSize: 17, fontWeight: "600", color: PlatformColor("label") },
  detail: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  body: { fontSize: 15, lineHeight: 22, color: PlatformColor("label") },
  link: { fontSize: 15, color: PlatformColor("link") },
});
