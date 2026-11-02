// Translation settings. The active provider and Custom's base URL/model go in user.db's settings table;
// API keys go only in expo-secure-store (the iOS Keychain), one per provider, and are never logged.
import * as SecureStore from "expo-secure-store";
import type { UserDb } from "../userdata/types";
import { CUSTOM_PROVIDER, DEFAULT_PROVIDER_ID, PRESETS, PROVIDERS, type ReasoningEffort } from "./presets";

/** What the online client needs to call a provider. */
export interface ResolvedProvider {
  id: string;
  baseURL: string;
  model: string;
  fallbackModel?: string;
  reasoningEffort?: ReasoningEffort;
}

/** Custom's user-entered settings. */
export interface CustomProvider {
  baseURL: string;
  model: string;
}

// Keys in the settings table.
const ACTIVE_KEY = "provider";
const CUSTOM_BASE_URL_KEY = "custom.baseURL";
const CUSTOM_MODEL_KEY = "custom.model";

async function getSetting(db: UserDb, key: string): Promise<string | null> {
  return (await db.first<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]))?.value ?? null;
}

function setSetting(db: UserDb, key: string, value: string): Promise<void> {
  return db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
}

// Errors name the provider id only, never a key.
function assertKnown(providerId: string): void {
  if (!PROVIDERS.some((p) => p.id === providerId)) throw new Error(`Unknown provider: ${providerId}`);
}

/** Custom's saved base URL and model, or null if never saved. */
export async function getCustomProvider(db: UserDb): Promise<CustomProvider | null> {
  const baseURL = await getSetting(db, CUSTOM_BASE_URL_KEY);
  const model = await getSetting(db, CUSTOM_MODEL_KEY);
  return baseURL !== null && model !== null ? { baseURL, model } : null;
}

/** Thrown for a Custom base URL that isn't http(s) or an empty model; `field` names which. */
export class CustomProviderError extends Error {
  constructor(
    readonly field: keyof CustomProvider,
    message: string,
  ) {
    super(message);
    this.name = "CustomProviderError";
  }
}

/**
 * Custom's base URL and model as they are stored: both trimmed, the base URL (http or https) ending in "/"
 * as the presets' do. Throws a CustomProviderError for an invalid one.
 */
export function normalizeCustomProvider(custom: CustomProvider): CustomProvider {
  const baseURL = custom.baseURL.trim();
  const model = custom.model.trim();
  if (!/^https?:\/\/\S+$/.test(baseURL)) throw new CustomProviderError("baseURL", "Custom base URL must start with http:// or https://");
  if (model === "") throw new CustomProviderError("model", "Custom model is required");
  return { baseURL: baseURL.endsWith("/") ? baseURL : `${baseURL}/`, model };
}

/** Saves Custom's base URL and model, normalized (normalizeCustomProvider). */
export async function saveCustomProvider(db: UserDb, custom: CustomProvider): Promise<void> {
  const { baseURL, model } = normalizeCustomProvider(custom);
  await setSetting(db, CUSTOM_BASE_URL_KEY, baseURL);
  await setSetting(db, CUSTOM_MODEL_KEY, model);
}

/**
 * The provider to call: the stored one, else the default. A stored id that is no longer a preset (removed
 * in an update) also resolves to the default. Custom has no fallback model.
 */
export async function getActiveProvider(db: UserDb): Promise<ResolvedProvider> {
  const id = await getSetting(db, ACTIVE_KEY);
  if (id === CUSTOM_PROVIDER.id) {
    const custom = await getCustomProvider(db);
    if (custom) return { id, ...custom };
  }
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PROVIDER_ID)!;
  const { label: _label, ...resolved } = preset;
  return resolved;
}

/** Makes `providerId` the active provider. Custom must be saved first. */
export async function setActiveProvider(db: UserDb, providerId: string): Promise<void> {
  assertKnown(providerId);
  if (providerId === CUSTOM_PROVIDER.id && !(await getCustomProvider(db))) throw new Error("Save the Custom provider first");
  await setSetting(db, ACTIVE_KEY, providerId);
}

/** The secure-store key holding a provider's API key (secure-store allows only [A-Za-z0-9._-]). */
export function apiKeyStoreKey(providerId: string): string {
  return `apiKey.${providerId}`;
}

/** The provider's API key, or null if none is saved. */
export async function getApiKey(providerId: string): Promise<string | null> {
  assertKnown(providerId);
  return SecureStore.getItemAsync(apiKeyStoreKey(providerId));
}

/** Saves the provider's API key (trimmed); an empty key clears it. */
export async function setApiKey(providerId: string, key: string): Promise<void> {
  assertKnown(providerId);
  const trimmed = key.trim();
  if (trimmed === "") return clearApiKey(providerId);
  await SecureStore.setItemAsync(apiKeyStoreKey(providerId), trimmed);
}

/** Deletes the provider's API key. */
export async function clearApiKey(providerId: string): Promise<void> {
  assertKnown(providerId);
  await SecureStore.deleteItemAsync(apiKeyStoreKey(providerId));
}
