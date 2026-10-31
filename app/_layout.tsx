import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";

// Root stack: the tab bar is one screen; pushed screens (entry details, dev checks) sit above it.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="dev-checks" options={{ title: "Dev checks" }} />
      </Stack>
    </ThemeProvider>
  );
}
