import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DbGate } from "../src/db/DbGate";

// Root stack: the tab bar is one screen; pushed screens (entry details, dev checks) sit above it.
// DbGate opens canto.db (useDb()) and user.db (useUserDb()) for every screen, with loading and
// error/Retry screens until both are open.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DbGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/[id]" options={{ title: "词条" }} />
          <Stack.Screen name="dev-checks" options={{ title: "Dev checks" }} />
        </Stack>
      </DbGate>
    </ThemeProvider>
  );
}
