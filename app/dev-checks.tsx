import { useState } from "react";
import { Button, PlatformColor, ScrollView, StyleSheet, Text, View } from "react-native";
import { DEV_CHECKS, runDevCheck, type DevCheckResult } from "../src/devChecks/checks";

// Hidden spike screen (P2-T2): runs each library check on the device's JS engine and shows the result.
export default function DevChecksScreen() {
  const [results, setResults] = useState<Record<string, DevCheckResult>>({});
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <Text style={styles.engine}>Engine: {"HermesInternal" in globalThis ? "Hermes" : "not Hermes"}</Text>
      {DEV_CHECKS.map((check) => {
        const result = results[check.label];
        return (
          <View key={check.label} style={styles.check}>
            <Button
              title={`Check ${check.label}: ${check.input}`}
              onPress={() => setResults((prev) => ({ ...prev, [check.label]: runDevCheck(check) }))}
            />
            {result && (
              <Text style={[styles.result, { color: PlatformColor(result.ok ? "systemGreen" : "systemRed") }]}>
                {result.ok ? "OK" : "FAIL"} {result.output}
                {!result.ok && ` (expected ${check.expected})`}
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 24 },
  engine: { fontSize: 15, color: PlatformColor("secondaryLabel") },
  check: { gap: 8 },
  result: { fontSize: 17, textAlign: "center" },
});
