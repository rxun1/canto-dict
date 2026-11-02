// testConnection: one short translateOnline call, reported as a user-facing message per error class (§7).
import {
  BadReplyError,
  HttpError,
  InvalidKeyError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  translateOnline,
} from "../translate/online/client";
import { CONNECTION_MESSAGES, CONNECTION_SAMPLE, connectionErrorMessage, testConnection } from "./testConnection";

jest.mock("../translate/online/client", () => ({
  ...jest.requireActual("../translate/online/client"),
  translateOnline: jest.fn(),
}));
const translateOnlineMock = jest.mocked(translateOnline);

const KEY = "sk-secret-abc";
const PROVIDER = { baseURL: "https://x.example/", model: "m", apiKey: KEY };

beforeEach(() => translateOnlineMock.mockReset());

describe("testConnection", () => {
  it("translates the short sample and reports success", async () => {
    translateOnlineMock.mockResolvedValue("你好");
    expect(await testConnection(PROVIDER)).toEqual({ ok: true, message: CONNECTION_MESSAGES.ok });
    expect(translateOnlineMock).toHaveBeenCalledWith(PROVIDER, CONNECTION_SAMPLE);
  });

  it("reports a failure with its message", async () => {
    translateOnlineMock.mockRejectedValue(new RateLimitError());
    expect(await testConnection(PROVIDER)).toEqual({ ok: false, message: CONNECTION_MESSAGES.rateLimit });
  });
});

describe("connectionErrorMessage", () => {
  it.each([
    [new InvalidKeyError(), CONNECTION_MESSAGES.invalidKey],
    [new RateLimitError(), CONNECTION_MESSAGES.rateLimit],
    [new TimeoutError(), CONNECTION_MESSAGES.timeout],
    [new NetworkError(`Network error: ${KEY}`), CONNECTION_MESSAGES.network],
    [new BadReplyError("Reply is not JSON"), CONNECTION_MESSAGES.badReply],
    [new Error(`boom ${KEY}`), CONNECTION_MESSAGES.failed],
    ["not an error", CONNECTION_MESSAGES.failed],
  ])("%p → its message", (error, message) => {
    expect(connectionErrorMessage(error)).toBe(message);
  });

  it("gives an HTTP error's status but not its body", () => {
    const message = connectionErrorMessage(new HttpError(503, `HTTP 503: body with ${KEY}`));
    expect(message).toBe("服务器返回错误（HTTP 503）");
    expect(message).not.toContain(KEY);
  });
});
