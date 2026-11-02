// What a translation's history row stores as output (spec §5.3: tapping it reopens it on the Translate tab).
// The final Translation as JSON, so reopening restores the result, Jyutping and tag without a network call
// (re-running translate() could give a different online result, or only the offline one when offline).
// The note is left out: it described that run (no key, a failed call), and may no longer hold.
import type { Translation } from "./index";

type StoredTranslation = Omit<Translation, "note">;

export function toHistoryOutput({ cantonese, jyutping, source }: Translation): string {
  const stored: StoredTranslation = { cantonese, jyutping, source };
  return JSON.stringify(stored);
}

/** The stored translation, or null when `output` isn't one (corrupt or hand-written rows). */
export function fromHistoryOutput(output: string): Translation | null {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { cantonese, jyutping, source } = value as Record<string, unknown>;
  if (typeof cantonese !== "string") return null;
  if (!Array.isArray(jyutping) || !jyutping.every((s) => s === null || typeof s === "string")) return null;
  if (source !== "offline" && source !== "online") return null;
  return { cantonese, jyutping, source };
}
