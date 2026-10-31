// Placeholder entry screen so Lookup rows have somewhere to go; P2-T7 builds the real one (spec §5.2).
import { useLocalSearchParams } from "expo-router";
import { PlaceholderScreen } from "../../src/components/PlaceholderScreen";

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen label={`词条 Entry ${id}`} />;
}
