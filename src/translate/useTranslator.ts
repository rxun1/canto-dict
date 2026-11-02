// The Translate tab's state (spec §6.1): the input, the result shown, and an input/failure error.
// translate() can't be cancelled, so each run takes a request number and drops updates from older runs.
import { useCallback, useRef, useState } from "react";
import type { Db } from "../db/types";
import { addHistory } from "../userdata/history";
import type { UserDb } from "../userdata/types";
import { MAX_INPUT_LENGTH, translate, TranslationInputError, type Translation } from "./index";
import { toHistoryOutput } from "./historyOutput";

export const INPUT_ERRORS: Readonly<Record<TranslationInputError["reason"], string>> = {
  empty: "请输入要翻译的文字",
  tooLong: `最多 ${MAX_INPUT_LENGTH} 字，请缩短`,
};
export const TRANSLATE_FAILED = "翻译失败";

export interface Translator {
  input: string;
  setInput: (text: string) => void;
  result: Translation | null;
  /** Why there is no result: invalid input or a failure (user-facing). */
  error: string | null;
  /** Translates the input; the result updates as translate() delivers, and the final one is logged to history. */
  run: () => void;
  /** Shows a translation reopened from History (no network call, not logged again). */
  restore: (input: string, result: Translation | null) => void;
}

export function useTranslator(db: Db, userDb: UserDb): Translator {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Translation | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by every run and restore; a run whose number is no longer current changes nothing on screen.
  const request = useRef(0);

  const run = useCallback(() => {
    const mine = ++request.current;
    const isCurrent = () => request.current === mine;
    setError(null);
    translate(input, (update) => isCurrent() && setResult(update), { db, userDb }).then(
      // Logged even when superseded: the user did run it.
      (final) => addHistory(userDb, { kind: "translation", input: input.trim(), output: toHistoryOutput(final) }).catch((e: unknown) => console.warn("Logging history failed", e)),
      (e: unknown) => {
        if (!(e instanceof TranslationInputError)) console.warn("Translating failed", e);
        if (!isCurrent()) return;
        setResult(null);
        setError(e instanceof TranslationInputError ? INPUT_ERRORS[e.reason] : TRANSLATE_FAILED);
      },
    );
  }, [input, db, userDb]);

  const restore = useCallback((text: string, restored: Translation | null) => {
    request.current++;
    setInput(text);
    setResult(restored);
    setError(null);
  }, []);

  return { input, setInput, result, error, run, restore };
}
