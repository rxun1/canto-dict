// Full-screen loading and error states for the app's databases, around the root layout. The app
// never shows a screen without them: children render only once canto.db and user.db are open.
// The iOS launch screen stays up while they open, so a normal launch goes straight to the tabs.
import * as SplashScreen from "expo-splash-screen";
import { Component, useEffect, type ReactNode } from "react";
import { ActivityIndicator, PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";
import { UserDbProvider } from "../userdata/expoUserDb";
import { DbOpenError, DbProvider } from "./expoDb";

export const LOADING = "正在准备词典…";
export const OPEN_FAILED = "词典数据库打开失败";
/** Any other error thrown while rendering the app (no route has its own error boundary). */
export const SOMETHING_FAILED = "出错了";
export const RETRY = "重试";
/** An open still running after this long (the first launch's asset copy) lifts the launch screen to show LOADING. */
export const SPLASH_MAX_MS = 1000;

// At import, before the first frame; it rejects only when there is no native splash (e.g. Jest).
SplashScreen.preventAutoHideAsync().catch(() => {});

type State = { error: { value: unknown } | null };

/**
 * Opens canto.db and user.db for its children. An open failure (thrown by either provider) shows an
 * error screen; Retry renders the providers again (the error screen unmounted them), which opens both
 * again. Errors thrown by screens land here too, with a generic message.
 */
export class DbGate extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: { value: error } };
  }

  componentDidCatch(error: unknown) {
    console.warn("App error", error);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.screen}>
          <HideSplash />
          <Text style={styles.message}>{this.state.error.value instanceof DbOpenError ? OPEN_FAILED : SOMETHING_FAILED}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={this.retry} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.retry}>{RETRY}</Text>
          </Pressable>
        </View>
      );
    }
    const loading = <Loading />;
    return (
      <DbProvider loading={loading}>
        <UserDbProvider loading={loading}>
          <HideSplash />
          {this.props.children}
        </UserDbProvider>
      </DbProvider>
    );
  }
}

/** Lifts the launch screen once mounted. */
function HideSplash() {
  useEffect(() => SplashScreen.hide(), []);
  return null;
}

function Loading() {
  useEffect(() => {
    const timer = setTimeout(() => SplashScreen.hide(), SPLASH_MAX_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.screen}>
      <ActivityIndicator />
      <Text style={styles.message}>{LOADING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: PlatformColor("systemBackground") },
  message: { fontSize: 17, color: PlatformColor("secondaryLabel") },
  retry: { fontSize: 17, color: PlatformColor("link") },
  pressed: { opacity: 0.5 },
});
