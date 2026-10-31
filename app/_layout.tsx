import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
import { DbProvider } from "../src/db/expoDb";
import { UserDbProvider } from "../src/userdata/expoUserDb";

// Root stack: the tab bar is one screen; pushed screens (entry details, dev checks) sit above it.
// DbProvider opens canto.db for every screen (useDb()); UserDbProvider opens user.db (useUserDb()).
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <DbProvider>
        <UserDbProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="entry/[id]" options={{ title: "词条" }} />
            <Stack.Screen name="dev-checks" options={{ title: "Dev checks" }} />
          </Stack>
        </UserDbProvider>
      </DbProvider>
    </ThemeProvider>
  );
}
