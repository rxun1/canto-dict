import { PlatformColor } from "react-native";

/** A small grey label (离线 / AI, TTS), as on the entry screen. */
export const tagStyle = {
  fontSize: 12,
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 6,
  overflow: "hidden",
  color: PlatformColor("secondaryLabel"),
  backgroundColor: PlatformColor("tertiarySystemFill"),
} as const;
