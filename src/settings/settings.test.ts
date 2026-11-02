// settings.ts over an in-memory user.db, with expo-secure-store mocked by an in-memory map.
import * as SecureStore from "expo-secure-store";
import { openTestUserDb, type TestUserDb } from "../userdata/testUserDb";
import { CUSTOM_PROVIDER, DEFAULT_PROVIDER_ID, PRESETS, PROVIDERS } from "./presets";
import {
  apiKeyStoreKey,
  clearApiKey,
  getActiveProvider,
  getApiKey,
  getCustomProvider,
  saveCustomProvider,
  setActiveProvider,
  setApiKey,
} from "./settings";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid secure-store key ${key}`);
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

let db: TestUserDb;
beforeEach(() => {
  db = openTestUserDb();
  mockStore.clear();
  jest.clearAllMocks();
});
afterEach(() => db.close());

/** Every value in user.db's settings table. */
const settingsValues = () => (db.raw.prepare("SELECT value FROM settings").all() as { value: string }[]).map((r) => r.value);

describe("presets", () => {
  it("Gemini is the default, with a fallback model for HTTP 429", () => {
    expect(DEFAULT_PROVIDER_ID).toBe("gemini");
    expect(PRESETS.map((p) => p.id)).toContain(DEFAULT_PROVIDER_ID);
    expect(PRESETS.find((p) => p.id === "gemini")).toEqual({
      id: "gemini",
      label: "Gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3.8-flash",
      fallbackModel: "gemini-3.5-flash-lite",
    });
  });

  it("Z.ai has no fallback model", () => {
    expect(PRESETS.find((p) => p.id === "zai")).toEqual({
      id: "zai",
      label: "Z.ai",
      baseURL: "https://api.z.ai/api/paas/v4/",
      model: "glm-4.7-flash",
    });
  });

  it("PROVIDERS lists the presets then Custom, with unique ids that are valid secure-store keys", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(["gemini", "zai", "custom"]);
    expect(PROVIDERS.at(-1)).toBe(CUSTOM_PROVIDER);
    for (const p of PROVIDERS) expect(apiKeyStoreKey(p.id)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("active provider", () => {
  it("is Gemini by default", async () => {
    expect(await getActiveProvider(db)).toEqual({
      id: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3.8-flash",
      fallbackModel: "gemini-3.5-flash-lite",
    });
  });

  it("setActiveProvider switches to another preset and persists", async () => {
    await setActiveProvider(db, "zai");
    expect(await getActiveProvider(db)).toEqual({ id: "zai", baseURL: "https://api.z.ai/api/paas/v4/", model: "glm-4.7-flash" });
    await setActiveProvider(db, "gemini");
    expect((await getActiveProvider(db)).id).toBe("gemini");
  });

  it("rejects an unknown provider id", async () => {
    await expect(setActiveProvider(db, "openai")).rejects.toThrow(/unknown provider/i);
    expect((await getActiveProvider(db)).id).toBe("gemini");
  });

  it("falls back to the default when the stored id is no longer a preset", async () => {
    await db.run("INSERT INTO settings (key, value) VALUES ('provider', 'removed')");
    expect((await getActiveProvider(db)).id).toBe("gemini");
  });
});

describe("Custom provider", () => {
  it("saving Custom persists baseURL and model (trimmed); activating it resolves them", async () => {
    expect(await getCustomProvider(db)).toBeNull();
    await saveCustomProvider(db, { baseURL: " https://example.com/v1/ ", model: " my-model " });
    expect(await getCustomProvider(db)).toEqual({ baseURL: "https://example.com/v1/", model: "my-model" });
    await setActiveProvider(db, "custom");
    expect(await getActiveProvider(db)).toEqual({ id: "custom", baseURL: "https://example.com/v1/", model: "my-model" });
  });

  it("adds the trailing slash the presets have", async () => {
    await saveCustomProvider(db, { baseURL: "http://localhost:11434/v1", model: "m" });
    expect((await getCustomProvider(db))?.baseURL).toBe("http://localhost:11434/v1/");
  });

  it("saving again overwrites the previous values", async () => {
    await saveCustomProvider(db, { baseURL: "https://a.example/", model: "a" });
    await saveCustomProvider(db, { baseURL: "https://b.example/", model: "b" });
    expect(await getCustomProvider(db)).toEqual({ baseURL: "https://b.example/", model: "b" });
  });

  it("rejects an empty model or a base URL that isn't http(s)", async () => {
    await expect(saveCustomProvider(db, { baseURL: "https://example.com/", model: "  " })).rejects.toThrow(/model/i);
    await expect(saveCustomProvider(db, { baseURL: "example.com", model: "m" })).rejects.toThrow(/base URL/i);
    expect(await getCustomProvider(db)).toBeNull();
  });

  it("can't be activated before it is saved", async () => {
    await expect(setActiveProvider(db, "custom")).rejects.toThrow(/custom/i);
    expect((await getActiveProvider(db)).id).toBe("gemini");
  });
});

describe("API keys", () => {
  it("are saved and read via expo-secure-store, one per provider, never in user.db", async () => {
    expect(await getApiKey("gemini")).toBeNull();
    await setApiKey("gemini", " AIza-secret ");
    await setApiKey("zai", "zai-secret");
    expect(await getApiKey("gemini")).toBe("AIza-secret");
    expect(await getApiKey("zai")).toBe("zai-secret");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("apiKey.gemini", "AIza-secret");
    expect(settingsValues()).toEqual([]);
  });

  it("the Custom key is stored the same way", async () => {
    await saveCustomProvider(db, { baseURL: "https://example.com/", model: "m" });
    await setApiKey("custom", "custom-secret");
    expect(await getApiKey("custom")).toBe("custom-secret");
    expect(settingsValues()).not.toContain("custom-secret");
  });

  it("clearApiKey removes the key; an empty key clears too", async () => {
    await setApiKey("gemini", "k1");
    await clearApiKey("gemini");
    expect(await getApiKey("gemini")).toBeNull();
    await setApiKey("zai", "k2");
    await setApiKey("zai", "   ");
    expect(await getApiKey("zai")).toBeNull();
  });

  it("rejects an unknown provider id without touching secure-store", async () => {
    await expect(setApiKey("nope", "k")).rejects.toThrow(/unknown provider/i);
    await expect(getApiKey("nope")).rejects.toThrow(/unknown provider/i);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("errors never contain the key", async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("keychain unavailable"));
    await expect(setApiKey("zai", "sk-top-secret")).rejects.toThrow("keychain unavailable");
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("keychain unavailable"));
    await expect(setApiKey("zai", "sk-top-secret")).rejects.not.toThrow(/sk-top-secret/);
  });
});
