import { StyleSheet, Text, View } from "react-native";

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
  // System secondary gray: readable on both the light and dark themes.
  label: { fontSize: 17, color: "#8e8e93" },
});
