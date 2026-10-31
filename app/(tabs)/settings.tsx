import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";
import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <PlaceholderScreen label="设置 Settings" />
      {__DEV__ && (
        <Link href="/dev-checks" style={styles.devLink}>
          Dev checks
        </Link>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  devLink: { padding: 24, textAlign: "center", color: "#007AFF", fontSize: 17 },
});
