import { Tabs } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ColorValue } from "react-native";

function tabIcon(name: SFSymbol) {
  return ({ color, size }: { color: ColorValue; size: number }) => <SymbolView name={name} tintColor={color} size={size} />;
}

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="lookup" options={{ title: "查字", tabBarIcon: tabIcon("magnifyingglass") }} />
      <Tabs.Screen name="translate" options={{ title: "翻译", tabBarIcon: tabIcon("character.bubble") }} />
      <Tabs.Screen name="saved" options={{ title: "收藏", tabBarIcon: tabIcon("star") }} />
      <Tabs.Screen name="settings" options={{ title: "设置", tabBarIcon: tabIcon("gearshape") }} />
    </Tabs>
  );
}
