// The online translator (spec §6.3): one OpenAI-compatible chat completions call, with a 15 s timeout and,
// on HTTP 429, one retry with the provider's fallback model. Takes the provider and key as plain values
// (src/settings resolves them); throws an OnlineTranslationError subclass the caller can branch on (§7).
// The API key goes only in the Authorization header: it is redacted from every error message and never logged.
import { buildMessages } from "./prompt";

/** How long one request (including reading its body) may take. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** How much of an error response's body an HttpError message quotes. */
const ERROR_BODY_SNIPPET_LENGTH = 200;

/** A provider as settings.getActiveProvider resolves it, plus its key. */
export interface OnlineProvider {
  /** Ends with "/". */
  baseURL: string;
  model: string;
  /** Retried once with this model on HTTP 429. */
  fallbackModel?: string;
  apiKey: string;
}

/** Base class of every error translateOnline throws. */
export class OnlineTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401/403 (or Gemini's 400 "API key not valid"): the key is wrong. */
export class InvalidKeyError extends OnlineTranslationError {
  constructor() {
    super("API key invalid");
  }
}

/** 429, after the fallback model (if any) was also rate limited. */
export class RateLimitError extends OnlineTranslationError {
  constructor() {
    super("Rate limited (HTTP 429)");
  }
}

/** No complete reply within REQUEST_TIMEOUT_MS. */
export class TimeoutError extends OnlineTranslationError {
  constructor() {
    super(`No reply within ${REQUEST_TIMEOUT_MS / 1000} s`);
  }
}

/** fetch itself failed (offline, DNS, TLS, …). */
export class NetworkError extends OnlineTranslationError {}

/** Any other non-2xx status. */
export class HttpError extends OnlineTranslationError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A 2xx reply that isn't a chat completion, or whose text has no Chinese characters. */
export class BadReplyError extends OnlineTranslationError {}

/** CJK ideographs: Ext A, the URO, compatibility ideographs, and the supplementary planes (as surrogate pairs). */
const CJK = /[㐀-䶿一-鿿豈-﫿]|[\uD840-\uD87F][\uDC00-\uDFFF]/;

/** A reply wrapped in a Markdown code fence: ```json … ``` */
const CODE_FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

/**
 * Translates Mandarin `text` into HK Cantonese (traditional characters) with the provider's model, retrying
 * once with its fallback model on HTTP 429. Rejects with an OnlineTranslationError subclass.
 */
export async function translateOnline(provider: OnlineProvider, text: string): Promise<string> {
  try {
    return await request(provider, provider.model, text);
  } catch (e) {
    if (!(e instanceof RateLimitError) || provider.fallbackModel === undefined) throw e;
  }
  return request(provider, provider.fallbackModel, text);
}

/** One chat completions call with `model`; the timeout covers the whole exchange. */
async function request(provider: OnlineProvider, model: string, text: string): Promise<string> {
  const redact = (s: string) => (provider.apiKey === "" ? s : s.split(provider.apiKey).join("***"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let status: number;
  let body: string;
  try {
    const response = await fetch(`${provider.baseURL}chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: buildMessages(text) }),
      signal: controller.signal,
    });
    status = response.status;
    body = await response.text();
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError();
    // No `cause`: the original error could carry request details.
    throw new NetworkError(`Network error: ${redact(e instanceof Error ? e.message : String(e))}`);
  } finally {
    clearTimeout(timer);
  }

  if (status === 401 || status === 403 || (status === 400 && /API key not valid|API_KEY_INVALID/.test(body))) {
    throw new InvalidKeyError();
  }
  if (status === 429) throw new RateLimitError();
  if (status < 200 || status > 299) {
    throw new HttpError(status, `HTTP ${status}: ${redact(body.slice(0, ERROR_BODY_SNIPPET_LENGTH))}`);
  }
  return parseCompletion(body);
}

/** The Cantonese text in a chat completion body: JSON {"cantonese": "…"}, else the raw text if it has CJK. */
function parseCompletion(body: string): string {
  let content: unknown;
  try {
    content = JSON.parse(body)?.choices?.[0]?.message?.content;
  } catch {
    throw new BadReplyError("Reply is not JSON");
  }
  if (typeof content !== "string") throw new BadReplyError("Reply has no message content");

  const trimmed = content.trim();
  const unfenced = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;
  let cantonese: string;
  try {
    const parsed: unknown = JSON.parse(unfenced);
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    const value = (parsed as { cantonese?: unknown }).cantonese;
    if (typeof value !== "string") throw new BadReplyError('Reply JSON has no "cantonese" string');
    cantonese = value.trim();
  } catch (e) {
    if (e instanceof BadReplyError) throw e;
    cantonese = trimmed;
  }
  if (!CJK.test(cantonese)) throw new BadReplyError("Reply has no Chinese text");
  return cantonese;
}
