import { PlatformColor, StyleSheet, Text, View } from "react-native";

/** Centered label for a screen that isn't built yet. */
export function PlaceholderScreen({ label }: { label: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 17, color: PlatformColor("secondaryLabel") },
});
