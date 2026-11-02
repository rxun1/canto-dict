// translate() (spec §6.1, §7): the offline result first, then, with a key and a connection, the online one
// in its place. Both are traditional internally: Jyutping is read on the traditional text and the displayed
// text goes through toSimp. Notes are user-facing and fixed strings, so the API key never reaches one.
import * as Network from "expo-network";
import type { Db } from "../db/types";
import { getActiveProvider, getApiKey } from "../settings/settings";
import type { UserDb } from "../userdata/types";
import { textToJyutping } from "./jyutping";
import { applyRules } from "./offline/rules";
import { phraseTable, substitute } from "./offline/substitute";
import { InvalidKeyError, translateOnline } from "./online/client";
import { toSimp, toTrad } from "./script";

/** The longest input translated, in characters (code points), after trimming. */
export const MAX_INPUT_LENGTH = 500;

/**
 * Why a result carries a note. noKey and invalidKey point to Settings (the UI links there); onlineFailed
 * means the online call failed and the offline result stays.
 */
export type TranslationNoteKind = "noKey" | "invalidKey" | "onlineFailed";

export interface TranslationNote {
  kind: TranslationNoteKind;
  message: string;
}

export interface Translation {
  /** Cantonese in simplified characters, for display. */
  cantonese: string;
  /** One Jyutping syllable per character of `cantonese`; null for punctuation and Latin. */
  jyutping: (string | null)[];
  source: "offline" | "online";
  note?: TranslationNote;
}

export const NOTES: Readonly<Record<TranslationNoteKind, TranslationNote>> = {
  noKey: { kind: "noKey", message: "Add an API key in Settings for AI translation" },
  invalidKey: { kind: "invalidKey", message: "API key invalid. Check it in Settings" },
  onlineFailed: { kind: "onlineFailed", message: "AI translation failed, showing the offline result" },
};

/** The input can't be translated: empty (after trimming), or longer than MAX_INPUT_LENGTH (ask to shorten it). */
export class TranslationInputError extends Error {
  constructor(readonly reason: "empty" | "tooLong") {
    super(reason === "empty" ? "Nothing to translate" : `Input is longer than ${MAX_INPUT_LENGTH} characters`);
    this.name = "TranslationInputError";
  }
}

export interface TranslateDeps {
  /** canto.db: phrase table and word readings. */
  db: Db;
  /** user.db: the active provider. */
  userDb: UserDb;
}

/**
 * Translates Mandarin `text` (simplified or traditional) into Cantonese. Calls `onUpdate` with the offline
 * result as soon as it is ready, then, when the online step (started in parallel) settles, at most once more:
 * with the online result, or the offline one with a note (no key, invalid key, online failure). With no
 * connection there is no second update. Resolves with the last result delivered, once everything has settled.
 * Rejects with TranslationInputError, before any update, if the input is invalid.
 */
export async function translate(text: string, onUpdate: (result: Translation) => void, deps: TranslateDeps): Promise<Translation> {
  const input = text.trim();
  if (input === "") throw new TranslationInputError("empty");
  if (Array.from(input).length > MAX_INPUT_LENGTH) throw new TranslationInputError("tooLong");

  // Started before the offline result is awaited, so the two run in parallel.
  const online = translateOnlineOrNote(input, deps);

  const table = await phraseTable(deps.db);
  const offline = await toResult(deps.db, applyRules(substitute(table, toTrad(input))), "offline");

  onUpdate(offline);
  const outcome = await online;
  if (outcome === null) return offline;
  const result = typeof outcome === "string" ? await toResult(deps.db, outcome, "online") : { ...offline, note: outcome };
  onUpdate(result);
  return result;
}

/**
 * The online translation (traditional), a note to show with the offline result, or null to keep the
 * offline result as it is (no connection). Never rejects.
 */
async function translateOnlineOrNote(input: string, { userDb }: TranslateDeps): Promise<string | TranslationNote | null> {
  try {
    const provider = await getActiveProvider(userDb);
    const apiKey = await getApiKey(provider.id);
    if (apiKey === null) return NOTES.noKey;
    if (!(await isOnline())) return null;
    return await translateOnline({ ...provider, apiKey }, input);
  } catch (e) {
    // Fixed notes only: an error's message is never shown, so the key can't leak through one.
    return e instanceof InvalidKeyError ? NOTES.invalidKey : NOTES.onlineFailed;
  }
}

/** False only when expo-network says there is no connection; true when it can't tell or the check fails. */
async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/** A result from traditional Cantonese: Jyutping read on the traditional, the text simplified for display. */
async function toResult(db: Db, traditional: string, source: Translation["source"]): Promise<Translation> {
  return { cantonese: toSimp(traditional), jyutping: await textToJyutping(db, traditional), source };
}
