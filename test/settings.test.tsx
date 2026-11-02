// Settings tab (spec §6.3, §7): pick a provider (presets fill base URL + model read-only, Custom makes them
// editable), save/clear a masked API key per provider, and test the connection. expo-secure-store is an
// in-memory map and translateOnline is mocked; their own tests cover them.
import type { ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { CUSTOM_PROVIDER, PRESETS } from "../src/settings/presets";
import { getActiveProvider, getApiKey, getCustomProvider } from "../src/settings/settings";
import { CONNECTION_MESSAGES } from "../src/settings/testConnection";
import { HttpError, InvalidKeyError, translateOnline } from "../src/translate/online/client";
import type { TestUserDb } from "../src/userdata/testUserDb";
import { resetMockUserDb } from "./helpers/mockUserDb";

jest.mock("../src/db/expoDb", () => {
  const { openTestDb } = jest.requireActual("../src/db/testDb");
  const db = openTestDb();
  return { DbProvider: ({ children }: { children: ReactNode }) => children, useDb: () => db };
});
jest.mock("../src/userdata/expoUserDb", () => require("./helpers/mockUserDb"));
jest.mock("../src/audio/playSyllables", () => ({ playSyllables: jest.fn(), speakTts: jest.fn() }));

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));
jest.mock("../src/translate/online/client", () => ({
  ...jest.requireActual("../src/translate/online/client"),
  translateOnline: jest.fn(),
}));

const translateOnlineMock = jest.mocked(translateOnline);
const getItemMock = jest.mocked(SecureStore.getItemAsync);
const setItemMock = jest.mocked(SecureStore.setItemAsync);

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const [GEMINI, ZAI] = PRESETS;
const KEY = "sk-very-secret-123";

const BASE_URL = "服务地址";
const MODEL = "模型";
const API_KEY = "API 密钥";
const SAVE_CUSTOM = "保存服务";
const SAVE_KEY = "保存密钥";
const CLEAR_KEY = "清除密钥";
const TEST = "测试连接";
const KEY_SAVED = "已保存密钥";
const NO_KEY = "未保存密钥";

let userDb: TestUserDb;
beforeEach(() => {
  userDb = resetMockUserDb();
  mockStore.clear();
  translateOnlineMock.mockReset();
});
afterEach(() => jest.restoreAllMocks());

const flush = () => act(async () => {});

async function openSettings() {
  const router = await renderRouter("./app", { initialUrl: "/settings" });
  await flush();
  return router;
}

const field = (label: string) => screen.getByLabelText(label);
const press = async (name: string, role: "button" | "tab" | "link" = "button") => {
  await fireEvent.press(screen.getByRole(role, { name }));
  await flush();
};

async function saveKey(key: string) {
  await fireEvent.changeText(field(API_KEY), key);
  await press(SAVE_KEY);
}

describe("settings screen: provider", () => {
  it("shows the default preset's base URL and model, read-only", async () => {
    await openSettings();
    expect(screen.getByRole("tab", { name: GEMINI.label }).props.accessibilityState).toMatchObject({ selected: true });
    expect(field(BASE_URL).props.value).toBe(GEMINI.baseURL);
    expect(field(BASE_URL).props.editable).toBe(false);
    expect(field(MODEL).props.value).toBe(GEMINI.model);
    expect(field(MODEL).props.editable).toBe(false);
  });

  it("choosing a preset fills its base URL and model and makes it active", async () => {
    await openSettings();
    await press(ZAI.label, "tab");
    expect(field(BASE_URL).props.value).toBe(ZAI.baseURL);
    expect(field(MODEL).props.value).toBe(ZAI.model);
    expect(field(MODEL).props.editable).toBe(false);
    expect((await getActiveProvider(userDb)).id).toBe(ZAI.id);
  });

  it("shows the stored active provider on open", async () => {
    await userDb.run("INSERT INTO settings (key, value) VALUES ('provider', 'zai')");
    await openSettings();
    expect(screen.getByRole("tab", { name: ZAI.label }).props.accessibilityState).toMatchObject({ selected: true });
    expect(field(BASE_URL).props.value).toBe(ZAI.baseURL);
  });

  it("Custom makes base URL and model editable and saves them on 保存服务", async () => {
    await openSettings();
    await press(CUSTOM_PROVIDER.label, "tab");
    expect(field(BASE_URL).props.editable).not.toBe(false);
    expect(field(MODEL).props.editable).not.toBe(false);
    expect(field(BASE_URL).props.value).toBe("");
    // Not active until saved.
    expect((await getActiveProvider(userDb)).id).toBe(GEMINI.id);

    await fireEvent.changeText(field(BASE_URL), " https://llm.example.com/v1 ");
    await fireEvent.changeText(field(MODEL), "my-model");
    await press(SAVE_CUSTOM);
    expect(await getCustomProvider(userDb)).toEqual({ baseURL: "https://llm.example.com/v1/", model: "my-model" });
    expect((await getActiveProvider(userDb)).id).toBe(CUSTOM_PROVIDER.id);
    expect(screen.getByText("已保存")).toBeTruthy();
  });

  it("shows the saved Custom values when Custom is chosen again", async () => {
    await userDb.run("INSERT INTO settings (key, value) VALUES ('custom.baseURL', 'https://a.example/'), ('custom.model', 'm1')");
    await openSettings();
    await press(CUSTOM_PROVIDER.label, "tab");
    expect(field(BASE_URL).props.value).toBe("https://a.example/");
    expect(field(MODEL).props.value).toBe("m1");
    // A saved Custom becomes active as soon as it is chosen.
    expect((await getActiveProvider(userDb)).id).toBe(CUSTOM_PROVIDER.id);
  });

  it("explains an invalid Custom base URL or a missing model, and saves nothing", async () => {
    await openSettings();
    await press(CUSTOM_PROVIDER.label, "tab");
    await fireEvent.changeText(field(BASE_URL), "llm.example.com");
    await fireEvent.changeText(field(MODEL), "m");
    await press(SAVE_CUSTOM);
    expect(screen.getByText("服务地址须以 http:// 或 https:// 开头")).toBeTruthy();

    await fireEvent.changeText(field(BASE_URL), "https://llm.example.com/");
    await fireEvent.changeText(field(MODEL), " ");
    await press(SAVE_CUSTOM);
    expect(screen.getByText("请输入模型名称")).toBeTruthy();
    expect(await getCustomProvider(userDb)).toBeNull();
  });
});

describe("settings screen: API key", () => {
  it("masks the key field", async () => {
    await openSettings();
    expect(field(API_KEY).props.secureTextEntry).toBe(true);
  });

  it("saves the key for the shown provider only when 保存密钥 is pressed, then empties the field", async () => {
    await openSettings();
    expect(screen.getByText(NO_KEY)).toBeTruthy();
    await fireEvent.changeText(field(API_KEY), KEY);
    expect(await getApiKey(GEMINI.id)).toBeNull();

    await press(SAVE_KEY);
    expect(await getApiKey(GEMINI.id)).toBe(KEY);
    expect(await getApiKey(ZAI.id)).toBeNull();
    expect(screen.getByText(KEY_SAVED)).toBeTruthy();
    expect(field(API_KEY).props.value).toBe("");
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
    expect(screen.queryByText(new RegExp(KEY))).toBeNull();
  });

  it("shows each provider's own key status", async () => {
    await openSettings();
    await saveKey(KEY);
    await press(ZAI.label, "tab");
    expect(screen.getByText(NO_KEY)).toBeTruthy();
    await press(GEMINI.label, "tab");
    expect(screen.getByText(KEY_SAVED)).toBeTruthy();
  });

  it("drops a typed but unsaved key when switching provider", async () => {
    await openSettings();
    await fireEvent.changeText(field(API_KEY), KEY);
    await press(ZAI.label, "tab");
    expect(field(API_KEY).props.value).toBe("");
    await press(SAVE_KEY);
    expect(await getApiKey(ZAI.id)).toBeNull();
  });

  it("clears the key on 清除密钥", async () => {
    await openSettings();
    await saveKey(KEY);
    await press(CLEAR_KEY);
    expect(await getApiKey(GEMINI.id)).toBeNull();
    expect(screen.getByText(NO_KEY)).toBeTruthy();
  });
});

describe("settings screen: test connection", () => {
  it("calls the shown provider with the saved key and shows success", async () => {
    translateOnlineMock.mockResolvedValue("你好");
    await openSettings();
    await saveKey(KEY);
    await press(TEST);
    expect(translateOnlineMock).toHaveBeenCalledWith(
      { baseURL: GEMINI.baseURL, model: GEMINI.model, fallbackModel: GEMINI.fallbackModel, apiKey: KEY },
      expect.any(String),
    );
    expect(screen.getByText(CONNECTION_MESSAGES.ok)).toBeTruthy();
  });

  it("uses a typed key before it is saved, without saving it", async () => {
    translateOnlineMock.mockResolvedValue("你好");
    await openSettings();
    await press(ZAI.label, "tab");
    await fireEvent.changeText(field(API_KEY), KEY);
    await press(TEST);
    expect(translateOnlineMock).toHaveBeenCalledWith({ baseURL: ZAI.baseURL, model: ZAI.model, apiKey: KEY }, expect.any(String));
    expect(await getApiKey(ZAI.id)).toBeNull();
  });

  it("tests Custom with the values in the fields", async () => {
    translateOnlineMock.mockResolvedValue("你好");
    await openSettings();
    await press(CUSTOM_PROVIDER.label, "tab");
    await fireEvent.changeText(field(BASE_URL), "https://llm.example.com/v1");
    await fireEvent.changeText(field(MODEL), "m");
    await fireEvent.changeText(field(API_KEY), KEY);
    await press(TEST);
    expect(translateOnlineMock).toHaveBeenCalledWith({ baseURL: "https://llm.example.com/v1/", model: "m", apiKey: KEY }, expect.any(String));
  });

  it("asks for a key instead of calling without one", async () => {
    await openSettings();
    await press(TEST);
    expect(translateOnlineMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONNECTION_MESSAGES.noKey)).toBeTruthy();
  });

  it("shows the error class's message, never the key or the reply body", async () => {
    await openSettings();
    await saveKey(KEY);
    translateOnlineMock.mockRejectedValueOnce(new InvalidKeyError());
    await press(TEST);
    expect(screen.getByText(CONNECTION_MESSAGES.invalidKey)).toBeTruthy();

    translateOnlineMock.mockRejectedValueOnce(new HttpError(500, `HTTP 500: secret body ${KEY}`));
    await press(TEST);
    expect(screen.queryByText(CONNECTION_MESSAGES.invalidKey)).toBeNull();
    expect(screen.getByText("服务器返回错误（HTTP 500）")).toBeTruthy();
    expect(screen.queryByText(/secret body/)).toBeNull();
    expect(screen.queryByText(new RegExp(KEY))).toBeNull();
  });

  it("clears the result when the provider changes", async () => {
    translateOnlineMock.mockResolvedValue("你好");
    await openSettings();
    await saveKey(KEY);
    await press(TEST);
    await press(ZAI.label, "tab");
    expect(screen.queryByText(CONNECTION_MESSAGES.ok)).toBeNull();
  });
});

describe("settings screen: links", () => {
  it("opens the licenses screen", async () => {
    const router = await openSettings();
    await press("数据来源与授权", "link");
    expect(router.getPathname()).toBe("/licenses");
  });

  it("keeps the Dev checks link in development builds", async () => {
    await openSettings();
    expect(screen.getByText("Dev checks")).toBeTruthy();
  });
});

describe("settings screen: replies after a provider switch", () => {
  it("drops a connection result for the provider switched away from", async () => {
    const reply = deferred<string>();
    translateOnlineMock.mockReturnValue(reply.promise);
    await openSettings();
    await saveKey(KEY);
    await press(TEST);
    await press(ZAI.label, "tab");
    await act(async () => reply.resolve("你好"));
    expect(screen.queryByText(CONNECTION_MESSAGES.ok)).toBeNull();
  });

  it("drops a key status read for the provider switched away from", async () => {
    mockStore.set("apiKey.gemini", KEY);
    await openSettings();
    expect(screen.getByText(KEY_SAVED)).toBeTruthy();
    const zaiStatus = deferred<string | null>();
    getItemMock.mockReturnValueOnce(zaiStatus.promise);
    await press(ZAI.label, "tab");
    await press(GEMINI.label, "tab");
    expect(screen.getByText(KEY_SAVED)).toBeTruthy();
    await act(async () => zaiStatus.resolve(null));
    expect(screen.getByText(KEY_SAVED)).toBeTruthy();
  });

  it("doesn't show a key saved for the provider switched away from as saved", async () => {
    await openSettings();
    const write = deferred<void>();
    setItemMock.mockImplementationOnce(async (key, value) => {
      await write.promise;
      mockStore.set(key, value);
    });
    await saveKey(KEY);
    await press(ZAI.label, "tab");
    await act(async () => write.resolve());
    expect(await getApiKey(GEMINI.id)).toBe(KEY);
    expect(screen.getByText(NO_KEY)).toBeTruthy();
    expect(screen.queryByText(KEY_SAVED)).toBeNull();
  });

  it("saves Custom but leaves the newly picked provider active when switched during the save", async () => {
    await openSettings();
    await press(CUSTOM_PROVIDER.label, "tab");
    await fireEvent.changeText(field(BASE_URL), "https://llm.example.com/");
    await fireEvent.changeText(field(MODEL), "m");
    const write = deferred<void>();
    const run = userDb.run.bind(userDb);
    jest.spyOn(userDb, "run").mockImplementationOnce(async (...args) => {
      await write.promise;
      return run(...args);
    });
    await press(SAVE_CUSTOM);
    await press(ZAI.label, "tab");
    await act(async () => write.resolve());
    expect(await getCustomProvider(userDb)).toEqual({ baseURL: "https://llm.example.com/", model: "m" });
    expect((await getActiveProvider(userDb)).id).toBe(ZAI.id);
    expect(screen.queryByText("已保存")).toBeNull();
  });
});

describe("settings screen: load failure", () => {
  it("shows an error with 重试, which loads the settings again", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await userDb.run("INSERT INTO settings (key, value) VALUES ('provider', 'zai')");
    jest.spyOn(userDb, "first").mockRejectedValueOnce(new Error("disk I/O error"));
    await openSettings();
    expect(screen.getByText("读取设置失败")).toBeTruthy();
    expect(screen.queryByLabelText(BASE_URL)).toBeNull();

    await press("重试");
    expect(screen.queryByText("读取设置失败")).toBeNull();
    expect(field(BASE_URL).props.value).toBe(ZAI.baseURL);
  });
});
