// translate() over the fixture canto.db and an in-memory user.db, with expo-secure-store (an in-memory
// map), expo-network and global fetch mocked.
import * as Network from "expo-network";
import { openTestDb } from "../db/testDb";
import type { Db } from "../db/types";
import { setApiKey } from "../settings/settings";
import { openTestUserDb, type TestUserDb } from "../userdata/testUserDb";
import { MAX_INPUT_LENGTH, translate, TranslationInputError, type Translation } from "./index";

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
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
const networkState = Network.getNetworkStateAsync as jest.Mock;

const KEY = "sk-secret-key-123";
/** Enough of the key to count as a leak. */
const KEY_PREFIX = KEY.slice(0, 5);

// The fixture phrase table has 他 → 佢, 今天 → 今日, 沒有 → 冇, 來 → 嚟, 上班 → 返工.
const INPUT = "他今天没有来上班。";
const OFFLINE: Translation = {
  cantonese: "佢今日冇嚟返工。",
  jyutping: ["keoi5", "gam1", "jat6", "mou5", "lai4", "faan1", "gung1", null],
  source: "offline",
};

/** A fetch Response with `body` as its text. */
const reply = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
/** A 200 chat completion whose message content is `content`. */
const completion = (content: string) => reply(200, JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));

const db = openTestDb();
afterAll(() => db.close());

let userDb: TestUserDb;
const fetchMock = jest.fn();
beforeEach(async () => {
  userDb = openTestUserDb();
  mockStore.clear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  networkState.mockReset();
  networkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
});
afterEach(() => userDb.close());

/** Runs translate and returns every result it delivered, in order, and what it resolved with. */
async function run(text: string = INPUT): Promise<{ updates: Translation[]; final: Translation }> {
  const updates: Translation[] = [];
  const final = await translate(text, (t) => updates.push(t), { db, userDb });
  return { updates, final };
}

describe("validation", () => {
  it("rejects empty or blank input as 'empty'", async () => {
    for (const text of ["", "   \n "]) {
      const onUpdate = jest.fn();
      const error = await translate(text, onUpdate, { db, userDb }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(TranslationInputError);
      expect((error as TranslationInputError).reason).toBe("empty");
      expect(onUpdate).not.toHaveBeenCalled();
    }
  });

  it(`rejects input over ${MAX_INPUT_LENGTH} characters (after trimming) as 'tooLong'`, async () => {
    expect(MAX_INPUT_LENGTH).toBe(500);
    const onUpdate = jest.fn();
    const error = await translate("好".repeat(MAX_INPUT_LENGTH + 1), onUpdate, { db, userDb }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TranslationInputError);
    expect((error as TranslationInputError).reason).toBe("tooLong");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it(`accepts exactly ${MAX_INPUT_LENGTH} characters, counting surrounding spaces out and astral characters once`, async () => {
    await expect(run(`  ${"好".repeat(MAX_INPUT_LENGTH)}  `)).resolves.toBeDefined();
    await expect(run("𠮶".repeat(MAX_INPUT_LENGTH))).resolves.toBeDefined();
  });
});

describe("offline", () => {
  it("delivers the offline result (simplified, Jyutping per character) first", async () => {
    const { updates } = await run();
    expect(updates[0]).toEqual(OFFLINE);
  });

  it("delivers it before the online reply arrives", async () => {
    await setApiKey("gemini", KEY);
    let answer!: (r: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const updates: Translation[] = [];
    const done = translate(INPUT, (t) => updates.push(t), { db, userDb });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(updates).toEqual([OFFLINE]);
    answer(completion('{"cantonese": "佢今日冇返工。"}'));
    await done;
    expect(updates).toHaveLength(2);
  });

  it("translates the trimmed input", async () => {
    const { updates } = await run(`  ${INPUT}\n`);
    expect(updates[0]).toEqual(OFFLINE);
  });
});

describe("online", () => {
  beforeEach(() => setApiKey("gemini", KEY));

  it("replaces the offline result with the online one (simplified for display, Jyutping on the traditional)", async () => {
    fetchMock.mockResolvedValue(completion('{"cantonese": "佢今日冇返工。"}'));
    const { updates, final } = await run();
    const online: Translation = {
      cantonese: "佢今日冇返工。",
      jyutping: ["keoi5", "gam1", "jat6", "mou5", "faan1", "gung1", null],
      source: "online",
    };
    expect(updates).toEqual([OFFLINE, online]);
    expect(final).toEqual(online);
    // The trimmed Mandarin input goes to the provider as is, with the stored key.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toContain(INPUT);
  });

  it("shows the online reply in simplified characters (學校 → 学校)", async () => {
    fetchMock.mockResolvedValue(completion('{"cantonese": "佢喺學校。"}'));
    const { final } = await run("他在学校。");
    expect(final.cantonese).toBe("佢喺学校。");
    expect(final.jyutping).toHaveLength(Array.from(final.cantonese).length);
  });

  it("keeps the offline result with a short note when the online call fails", async () => {
    fetchMock.mockResolvedValue(reply(500, "Internal error"));
    const { updates, final } = await run();
    expect(updates).toHaveLength(2);
    expect(final).toEqual({ ...OFFLINE, note: { kind: "onlineFailed", message: expect.any(String) } });
    expect(updates[1]).toEqual(final);
  });

  it("keeps the offline result with a note on a network error or a reply with no Chinese text", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect((await run()).final.note?.kind).toBe("onlineFailed");
    fetchMock.mockResolvedValueOnce(completion("I can't help with that."));
    expect((await run()).final.note?.kind).toBe("onlineFailed");
  });

  it("keeps the offline result with a note when reading the online reply's Jyutping fails", async () => {
    // canto.db starts failing once the offline result is out; only then does the online reply arrive.
    let broken = false;
    const failingDb: Db = {
      all: (sql, params) => (broken ? Promise.reject(new Error("db closed")) : db.all(sql, params)),
      first: (sql, params) => (broken ? Promise.reject(new Error("db closed")) : db.first(sql, params)),
    };
    let respond!: () => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (respond = () => resolve(completion('{"cantonese": "佢今日冇返工。"}')))));
    const final = await translate(INPUT, () => {
      broken = true;
      respond();
    }, { db: failingDb, userDb });
    expect(final).toEqual({ ...OFFLINE, note: { kind: "onlineFailed", message: expect.any(String) } });
  });

  it("an invalid key keeps the offline result with an 'API key invalid' note pointing to Settings", async () => {
    fetchMock.mockResolvedValue(reply(401, `{"error": "bad key ${KEY}"}`));
    const { final } = await run();
    expect(final).toEqual({ ...OFFLINE, note: { kind: "invalidKey", message: expect.stringContaining("API key invalid") } });
    expect(final.note!.message).toContain("Settings");
    expect(final.note!.message).not.toContain(KEY_PREFIX);
  });

  it("never puts the key in a note", async () => {
    fetchMock.mockResolvedValue(reply(500, `echo ${KEY}`));
    expect(JSON.stringify((await run()).final)).not.toContain(KEY_PREFIX);
    fetchMock.mockRejectedValue(new TypeError(`failed for ${KEY}`));
    expect(JSON.stringify((await run()).final)).not.toContain(KEY_PREFIX);
  });

  it("uses the active provider's key", async () => {
    await setApiKey("zai", "zai-key");
    await userDb.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('provider', 'zai')");
    fetchMock.mockResolvedValue(completion('{"cantonese": "佢今日冇返工。"}'));
    await run();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer zai-key");
  });
});

describe("no key", () => {
  it("gives the offline result only, with a hint pointing to Settings, and never calls fetch", async () => {
    const { updates, final } = await run();
    expect(fetchMock).not.toHaveBeenCalled();
    const withHint: Translation = { ...OFFLINE, note: { kind: "noKey", message: expect.stringContaining("Settings") } };
    expect(updates).toEqual([OFFLINE, withHint]);
    expect(final).toEqual(withHint);
  });
});

describe("no connection", () => {
  beforeEach(() => setApiKey("gemini", KEY));

  it.each([
    { isConnected: false, isInternetReachable: false },
    { isConnected: true, isInternetReachable: false },
    { isConnected: false },
  ])("gives the offline result with no note and never calls fetch (%o)", async (state) => {
    networkState.mockResolvedValue(state);
    const { updates, final } = await run();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toEqual([OFFLINE]);
    expect(final).toEqual(OFFLINE);
  });

  it("tries online anyway when reachability is unknown", async () => {
    networkState.mockResolvedValue({ isConnected: true });
    fetchMock.mockResolvedValue(completion('{"cantonese": "佢今日冇返工。"}'));
    expect((await run()).final.source).toBe("online");
  });

  it("tries online anyway when the network check throws", async () => {
    networkState.mockRejectedValue(new Error("native module missing"));
    fetchMock.mockResolvedValue(completion('{"cantonese": "佢今日冇返工。"}'));
    expect((await run()).final.source).toBe("online");
  });
});
