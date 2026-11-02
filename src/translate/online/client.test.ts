// client.ts with global fetch mocked: each test queues the replies the "server" gives.
import {
  BadReplyError,
  HttpError,
  InvalidKeyError,
  NetworkError,
  OnlineTranslationError,
  RateLimitError,
  REQUEST_TIMEOUT_MS,
  TimeoutError,
  translateOnline,
  type OnlineProvider,
} from "./client";
import { buildMessages, FEW_SHOT, SYSTEM_PROMPT } from "./prompt";

const KEY = "sk-secret-key-123";
const GEMINI: OnlineProvider = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  model: "gemini-3.8-flash",
  fallbackModel: "gemini-3.5-flash-lite",
  apiKey: KEY,
};
const ZAI: OnlineProvider = { baseURL: "https://api.z.ai/api/paas/v4/", model: "glm-4.7-flash", apiKey: KEY };

/** A fetch Response with `body` as its text. */
const reply = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
/** A 200 chat completion whose message content is `content`. */
const completion = (content: string) => reply(200, JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

/** The parsed JSON body of the n-th fetch call. */
const requestBody = (n = 0) => JSON.parse(fetchMock.mock.calls[n][1].body as string);

/** The error `promise` rejects with (fails the test if it resolves). */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection");
}

describe("prompt", () => {
  it("is the system prompt, the few-shot pairs as earlier turns, then the input", () => {
    const messages = buildMessages("你好");
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages).toHaveLength(1 + FEW_SHOT.length * 2 + 1);
    expect(messages[1]).toEqual({ role: "user", content: FEW_SHOT[0].mandarin });
    expect(JSON.parse(messages[2].content)).toEqual({ cantonese: FEW_SHOT[0].cantonese });
    expect(messages.at(-1)).toEqual({ role: "user", content: "你好" });
  });

  it("asks for HK Cantonese in traditional characters as JSON", () => {
    expect(SYSTEM_PROMPT).toMatch(/Hong Kong Cantonese/);
    expect(SYSTEM_PROMPT).toMatch(/traditional/);
    expect(SYSTEM_PROMPT).toContain('{"cantonese"');
  });
});

describe("translateOnline", () => {
  it("POSTs the chat request to baseURL + chat/completions with the key as a Bearer token", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"cantonese": "佢冇錢"}'));
    await translateOnline(GEMINI, "他没有钱");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
    expect(init.signal).toBeDefined();
    expect(requestBody()).toMatchObject({ model: "gemini-3.8-flash", messages: buildMessages("他没有钱") });
  });

  it("200 with JSON content → the Cantonese text, trimmed", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"cantonese": " 佢冇錢。 "}'));
    await expect(translateOnline(ZAI, "他没有钱。")).resolves.toBe("佢冇錢。");
  });

  it("accepts JSON wrapped in a code fence", async () => {
    fetchMock.mockResolvedValueOnce(completion('```json\n{"cantonese": "我喺屋企睇電視"}\n```'));
    await expect(translateOnline(ZAI, "我在家看电视")).resolves.toBe("我喺屋企睇電視");
  });

  it("content that is not JSON but has CJK → accepted as the raw text", async () => {
    fetchMock.mockResolvedValueOnce(completion(" 你食咗飯未呀？\n"));
    await expect(translateOnline(ZAI, "你吃饭了吗？")).resolves.toBe("你食咗飯未呀？");
  });

  it("content with no CJK → BadReplyError", async () => {
    fetchMock.mockResolvedValueOnce(completion("Sorry, I can't help with that."));
    const error = await rejection(translateOnline(ZAI, "你好"));
    expect(error).toBeInstanceOf(BadReplyError);
    expect(error).toBeInstanceOf(OnlineTranslationError);
  });

  it("JSON whose cantonese has no CJK, or is missing → BadReplyError", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"cantonese": "hello"}'));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(BadReplyError);
    fetchMock.mockResolvedValueOnce(completion('{"translation": "你好"}'));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(BadReplyError);
  });

  it("a 200 body that is not a chat completion → BadReplyError", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, "<html>你好</html>"));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(BadReplyError);
    fetchMock.mockResolvedValueOnce(reply(200, '{"choices": []}'));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(BadReplyError);
  });

  it("401 and 403 → InvalidKeyError, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, '{"error": {"message": "Unauthorized"}}'));
    await expect(translateOnline(GEMINI, "你好")).rejects.toBeInstanceOf(InvalidKeyError);
    fetchMock.mockResolvedValueOnce(reply(403, "Forbidden"));
    await expect(translateOnline(GEMINI, "你好")).rejects.toBeInstanceOf(InvalidKeyError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Gemini's 400 'API key not valid' → InvalidKeyError; other 400s → HttpError", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, '[{"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}]'),
    );
    await expect(translateOnline(GEMINI, "你好")).rejects.toBeInstanceOf(InvalidKeyError);
    fetchMock.mockResolvedValueOnce(reply(400, '{"error": {"message": "model not found"}}'));
    const error = await rejection(translateOnline(GEMINI, "你好"));
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
  });

  it("429 → retries once with the fallback model", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, "rate limited")).mockResolvedValueOnce(completion('{"cantonese": "你好"}'));
    await expect(translateOnline(GEMINI, "你好")).resolves.toBe("你好");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(0).model).toBe("gemini-3.8-flash");
    expect(requestBody(1).model).toBe("gemini-3.5-flash-lite");
  });

  it("429 twice → RateLimitError after one retry", async () => {
    fetchMock.mockResolvedValue(reply(429, "rate limited"));
    await expect(translateOnline(GEMINI, "你好")).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 with no fallback model → RateLimitError, no retry", async () => {
    fetchMock.mockResolvedValue(reply(429, "rate limited"));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("other HTTP errors → HttpError with the status", async () => {
    fetchMock.mockResolvedValueOnce(reply(503, "Service Unavailable"));
    const error = await rejection(translateOnline(ZAI, "你好"));
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(503);
    expect(error.message).toContain("503");
  });

  it("a failing fetch → NetworkError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(translateOnline(ZAI, "你好")).rejects.toBeInstanceOf(NetworkError);
  });

  describe("timeout", () => {
    /** A fetch that never answers, and rejects like fetch does when its signal aborts. */
    const hangingFetch = (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
      });

    it(`aborts after ${REQUEST_TIMEOUT_MS} ms → TimeoutError`, async () => {
      jest.useFakeTimers();
      fetchMock.mockImplementation(hangingFetch);
      const result = translateOnline(ZAI, "你好");
      const settled = jest.fn();
      result.then(settled, settled);
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await expect(result).rejects.toBeInstanceOf(TimeoutError);
    });

    it("the timeout covers reading the body", async () => {
      jest.useFakeTimers();
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        text: () => hangingFetch(_url, init),
      }));
      const result = rejection(translateOnline(ZAI, "你好"));
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      expect(await result).toBeInstanceOf(TimeoutError);
    });

    it("leaves no timer running after a reply", async () => {
      jest.useFakeTimers();
      fetchMock.mockResolvedValueOnce(completion('{"cantonese": "你好"}'));
      await translateOnline(ZAI, "你好");
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe("the API key never leaks", () => {
    const failures: [string, () => void][] = [
      ["a server error body that echoes the key", () => fetchMock.mockResolvedValue(reply(500, `bad request for key ${KEY}`))],
      ["a 401 body that echoes the key", () => fetchMock.mockResolvedValue(reply(401, `invalid key ${KEY}`))],
      ["a failing fetch whose message has the key", () => fetchMock.mockRejectedValue(new TypeError(`failed: Bearer ${KEY}`))],
      ["a no-CJK reply that echoes the key", () => fetchMock.mockResolvedValue(completion(`your key is ${KEY}`))],
    ];

    it.each(failures)("%s → the error and the console never contain it", async (_name, setUp) => {
      setUp();
      const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
        jest.spyOn(console, level).mockImplementation(() => {}),
      );
      const error = await rejection(translateOnline(ZAI, "你好"));
      expect(error).toBeInstanceOf(OnlineTranslationError);
      expect(error.message).not.toContain(KEY);
      expect(String(error.stack)).not.toContain(KEY);
      expect(JSON.stringify(error)).not.toContain(KEY);
      expect(JSON.stringify(error.cause ?? null)).not.toContain(KEY);
      for (const log of logs) {
        expect(JSON.stringify(log.mock.calls)).not.toContain(KEY);
        log.mockRestore();
      }
    });
  });
});
