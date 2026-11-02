// An iOS-style segmented control (Saved's 收藏 | 历史, Translate's 语音 | 音节): tabs with the selected one raised.
import { PlatformColor, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

export interface Segment<K extends string> {
  key: K;
  label: string;
}

export function SegmentedControl<K extends string>({
  segments,
  selected,
  onSelect,
  style,
}: {
  segments: readonly Segment<K>[];
  selected: K;
  onSelect: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segments, style]} accessibilityRole="tablist">
      {segments.map(({ key, label }) => (
        <Pressable
          key={key}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: selected === key }}
          onPress={() => onSelect(key)}
          style={[styles.segment, selected === key && styles.segmentSelected]}
        >
          <Text style={styles.segmentText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: "row", padding: 2, borderRadius: 9, backgroundColor: PlatformColor("tertiarySystemFill") },
  segment: { flex: 1, alignItems: "center", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 7 },
  segmentSelected: { backgroundColor: PlatformColor("systemBackground") },
  segmentText: { fontSize: 15, color: PlatformColor("label") },
});
