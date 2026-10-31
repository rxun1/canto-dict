import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DbProvider } from "../src/db/expoDb";

// Root stack: the tab bar is one screen; pushed screens (entry details, dev checks) sit above it.
// DbProvider opens canto.db for every screen (useDb()).
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DbProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/[id]" options={{ title: "词条" }} />
          <Stack.Screen name="dev-checks" options={{ title: "Dev checks" }} />
        </Stack>
      </DbProvider>
    </ThemeProvider>
  );
}
