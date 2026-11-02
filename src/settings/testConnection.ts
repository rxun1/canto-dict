// Settings' 测试连接: one short translateOnline call, reported as a user-facing message per error class
// (spec §7). Messages are fixed text (an HTTP error adds only its status): never the error's own message,
// which can quote the reply body, and never the key.
import {
  BadReplyError,
  HttpError,
  InvalidKeyError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  translateOnline,
  type OnlineProvider,
} from "../translate/online/client";

/** What the test translates: short, so the call is quick and cheap. */
export const CONNECTION_SAMPLE = "你好";

export const CONNECTION_MESSAGES = {
  ok: "连接成功",
  noKey: "请先输入 API 密钥",
  invalidKey: "API 密钥无效",
  rateLimit: "请求太频繁，请稍后再试",
  timeout: "连接超时",
  network: "无法连接，请检查网络",
  badReply: "服务的回复无法识别，请检查模型名称",
  failed: "连接失败",
} as const;

/** The message for a failed connection test. */
export function connectionErrorMessage(error: unknown): string {
  if (error instanceof InvalidKeyError) return CONNECTION_MESSAGES.invalidKey;
  if (error instanceof RateLimitError) return CONNECTION_MESSAGES.rateLimit;
  if (error instanceof TimeoutError) return CONNECTION_MESSAGES.timeout;
  if (error instanceof NetworkError) return CONNECTION_MESSAGES.network;
  if (error instanceof HttpError) return `服务器返回错误（HTTP ${error.status}）`;
  if (error instanceof BadReplyError) return CONNECTION_MESSAGES.badReply;
  return CONNECTION_MESSAGES.failed;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/** Translates CONNECTION_SAMPLE with `provider`; resolves (never rejects) with the outcome's message. */
export async function testConnection(provider: OnlineProvider): Promise<ConnectionResult> {
  try {
    await translateOnline(provider, CONNECTION_SAMPLE);
    return { ok: true, message: CONNECTION_MESSAGES.ok };
  } catch (e) {
    return { ok: false, message: connectionErrorMessage(e) };
  }
}
