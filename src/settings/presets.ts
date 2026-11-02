// Online translation providers (spec §6.3). Data only: adding a provider means adding a preset here,
// with no code change elsewhere. Every provider speaks the OpenAI-compatible chat completions API.

/** A built-in provider. Ids also name the API key in secure-store, so keep them to [A-Za-z0-9._-]. */
export interface ProviderPreset {
  id: string;
  label: string;
  /** Ends with "/"; the client appends "chat/completions". */
  baseURL: string;
  model: string;
  /** Retried once with this model on HTTP 429. */
  fallbackModel?: string;
  /** Sent as reasoning_effort, for models that think before replying; omitted when unset. */
  reasoningEffort?: ReasoningEffort;
}

/** The OpenAI-compatible reasoning_effort values. */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

/** The built-in providers, in display order. */
export const PRESETS: readonly ProviderPreset[] = [
  {
    id: "gemini",
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-3.8-flash",
    fallbackModel: "gemini-3.5-flash-lite",
    // Gemini 3 always thinks; left unbounded it can run past REQUEST_TIMEOUT_MS (suspected cause of 连接超时 on the device).
    reasoningEffort: "low",
  },
  {
    id: "zai",
    label: "Z.ai",
    baseURL: "https://api.z.ai/api/paas/v4/",
    model: "glm-4.7-flash",
  },
];

/** The user-entered provider: its base URL and model are stored in user.db (settings.ts). */
export const CUSTOM_PROVIDER = { id: "custom", label: "Custom" } as const;

/** Every provider the user can pick, in display order. */
export const PROVIDERS: readonly { id: string; label: string }[] = [...PRESETS, CUSTOM_PROVIDER];

export const DEFAULT_PROVIDER_ID = "gemini";
