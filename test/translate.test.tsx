// Translate tab (spec §6, §6.4, §7): the result with Jyutping under each character, the 离线 / AI tag and
// notes, stale updates dropped, read-aloud, history logging and reopening a translation from History.
// translate() and speakSentence() are mocked; their own tests cover them.
import type { ReactNode } from "react";
import { act, fireEvent, renderRouter, screen, within } from "expo-router/testing-library";
import { speakSentence } from "../src/audio/speakSentence";
import { NOTES, translate, TranslationInputError, type Translation } from "../src/translate";
import { toHistoryOutput } from "../src/translate/historyOutput";
import { addHistory, listHistory } from "../src/userdata/history";
import type { TestUserDb } from "../src/userdata/testUserDb";
import { resetMockUserDb } from "./helpers/mockUserDb";

// expo-sqlite is native: useDb() returns the fixture DB, useUserDb() an in-memory user.db.
jest.mock("../src/db/expoDb", () => {
  const { openTestDb } = jest.requireActual("../src/db/testDb");
  const db = openTestDb();
  return { DbProvider: ({ children }: { children: ReactNode }) => children, useDb: () => db };
});
jest.mock("../src/userdata/expoUserDb", () => require("./helpers/mockUserDb"));
jest.mock("../src/translate", () => ({ ...jest.requireActual("../src/translate"), translate: jest.fn() }));
jest.mock("../src/audio/speakSentence", () => ({ speakSentence: jest.fn() }));
// expo-audio is native too, and loads with the entry screen.
jest.mock("../src/audio/playSyllables", () => ({ playSyllables: jest.fn(), speakTts: jest.fn() }));

const translateMock = jest.mocked(translate);
const speakMock = jest.mocked(speakSentence);

const PLACEHOLDER = "输入普通话";
const TRANSLATE = "翻译";

const OFFLINE: Translation = { cantonese: "雪柜", jyutping: ["syut3", "gwai6"], source: "offline" };
const ONLINE: Translation = { cantonese: "部雪柜", jyutping: ["bou6", "syut3", "gwai6"], source: "online" };

type OnUpdate = (result: Translation) => void;

/** translate() delivering `results` in order, then resolving with the last. */
function delivers(...results: Translation[]) {
  translateMock.mockImplementation(async (_text, onUpdate) => {
    results.forEach((r) => onUpdate(r));
    return results[results.length - 1];
  });
}

let userDb: TestUserDb;
beforeEach(() => {
  userDb = resetMockUserDb();
  translateMock.mockReset();
  speakMock.mockReset();
});
afterEach(() => jest.restoreAllMocks());

const flush = () => act(async () => {});

async function run(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), text);
  await fireEvent.press(screen.getByRole("button", { name: TRANSLATE }));
  await flush();
}

const openTranslate = () => renderRouter("./app", { initialUrl: "/translate" });
// Tab buttons are labelled "<title>, tab, <n> of 4".
const SAVED_TAB = "收藏, tab, 3 of 4";

async function openSavedHistory() {
  const router = await renderRouter("./app", { initialUrl: "/saved" });
  await fireEvent.press(await screen.findByRole("tab", { name: "历史" }));
  return router;
}

describe("translate screen", () => {
  it("shows the Cantonese with Jyutping under each character and the 离线 tag", async () => {
    delivers(OFFLINE);
    await openTranslate();
    await run("冰箱");
    expect(translateMock).toHaveBeenCalledWith("冰箱", expect.any(Function), expect.objectContaining({ db: expect.anything(), userDb }));
    const first = within(screen.getByTestId("char-0"));
    expect(first.getByText("雪")).toBeTruthy();
    expect(first.getByText("syut3")).toBeTruthy();
    const second = within(screen.getByTestId("char-1"));
    expect(second.getByText("柜")).toBeTruthy();
    expect(second.getByText("gwai6")).toBeTruthy();
    expect(screen.getByText("离线")).toBeTruthy();
  });

  it("shows no Jyutping under a character without a reading", async () => {
    delivers({ cantonese: "好！", jyutping: ["hou2", null], source: "offline" });
    await openTranslate();
    await run("好！");
    const cell = within(screen.getByTestId("char-1"));
    expect(cell.getAllByText(/.+/).map((t) => t.props.children)).toEqual(["！"]);
  });

  it("swaps the tag to AI when the online result arrives", async () => {
    delivers(OFFLINE, ONLINE);
    await openTranslate();
    await run("冰箱");
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.queryByText("离线")).toBeNull();
    expect(within(screen.getByTestId("char-0")).getByText("部")).toBeTruthy();
  });

  it("shows the note, with a link to Settings for a key problem", async () => {
    delivers(OFFLINE, { ...OFFLINE, note: NOTES.invalidKey });
    const router = await openTranslate();
    await run("冰箱");
    expect(screen.getByText(NOTES.invalidKey.message)).toBeTruthy();
    expect(screen.getByText("离线")).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "去设置" }));
    expect(router.getPathname()).toBe("/settings");
  });

  it("shows an online failure note without a Settings link", async () => {
    delivers(OFFLINE, { ...OFFLINE, note: NOTES.onlineFailed });
    await openTranslate();
    await run("冰箱");
    expect(screen.getByText(NOTES.onlineFailed.message)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "去设置" })).toBeNull();
  });

  it("never lets a late update from an earlier translate overwrite a newer one", async () => {
    const pending: { onUpdate: OnUpdate; finish: (r: Translation) => void }[] = [];
    translateMock.mockImplementation(
      (_text, onUpdate) => new Promise<Translation>((resolve) => pending.push({ onUpdate, finish: resolve })),
    );
    await openTranslate();
    await run("冰箱");
    await run("你好");
    await act(async () => {
      pending[1].onUpdate({ cantonese: "你好", jyutping: ["nei5", "hou2"], source: "offline" });
    });
    await act(async () => {
      pending[0].onUpdate(OFFLINE);
      pending[0].finish(OFFLINE);
    });
    expect(screen.getByText("nei5")).toBeTruthy();
    expect(screen.queryByText("syut3")).toBeNull();
  });

  it("ignores a failure from an earlier translate once a newer one has started", async () => {
    let fail: (e: Error) => void = () => {};
    translateMock.mockImplementationOnce(() => new Promise<Translation>((_resolve, reject) => (fail = reject)));
    await openTranslate();
    await run("冰箱");
    delivers(OFFLINE);
    await run("冰箱！");
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => fail(new Error("disk I/O error")));
    expect(screen.queryByText("翻译失败")).toBeNull();
    expect(screen.getByText("syut3")).toBeTruthy();
  });

  it("asks for text when the input is empty, and to shorten it when too long", async () => {
    translateMock.mockRejectedValueOnce(new TranslationInputError("empty"));
    await openTranslate();
    await run("  ");
    expect(screen.getByText("请输入要翻译的文字")).toBeTruthy();

    translateMock.mockRejectedValueOnce(new TranslationInputError("tooLong"));
    await run("长".repeat(501));
    expect(screen.getByText("最多 500 字，请缩短")).toBeTruthy();
  });

  it("says so when translating fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    translateMock.mockRejectedValueOnce(new Error("disk I/O error"));
    await openTranslate();
    await run("冰箱");
    expect(screen.getByText("翻译失败")).toBeTruthy();
  });
});

describe("read-aloud", () => {
  it("🔊 speaks with the iOS voice by default; the toggle switches to syllables", async () => {
    delivers(OFFLINE);
    speakMock.mockResolvedValue({ missingVoice: false, usedTts: false });
    await openTranslate();
    await run("冰箱");
    expect(screen.getByRole("tab", { name: "语音" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(speakMock).toHaveBeenLastCalledWith("雪柜", ["syut3", "gwai6"], "voice");

    await fireEvent.press(screen.getByRole("tab", { name: "音节" }));
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(speakMock).toHaveBeenLastCalledWith("雪柜", ["syut3", "gwai6"], "syllables");
  });

  it("shows the TTS tag when a syllable fell back to TTS", async () => {
    delivers(OFFLINE);
    speakMock.mockResolvedValue({ missingVoice: false, usedTts: true });
    await openTranslate();
    await run("冰箱");
    expect(screen.queryByText("TTS")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "音节" }));
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(screen.getByText("TTS")).toBeTruthy();
  });

  it("clears the shown status when the mode is switched", async () => {
    delivers(OFFLINE);
    speakMock.mockResolvedValueOnce({ missingVoice: true });
    await openTranslate();
    await run("冰箱");
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(screen.getByText(/朗读内容/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "音节" }));
    expect(screen.queryByText(/朗读内容/)).toBeNull();

    speakMock.mockResolvedValueOnce({ missingVoice: false, usedTts: true });
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(screen.getByText("TTS")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "语音" }));
    expect(screen.queryByText("TTS")).toBeNull();
    // Back to 音节: the earlier TTS tag doesn't come back either.
    await fireEvent.press(screen.getByRole("tab", { name: "音节" }));
    expect(screen.queryByText("TTS")).toBeNull();
  });

  it("ignores a voice reply that arrives after switching to syllables", async () => {
    delivers(OFFLINE);
    let reply: (r: { missingVoice: true }) => void = () => {};
    speakMock.mockImplementationOnce(() => new Promise((resolve) => (reply = resolve)));
    await openTranslate();
    await run("冰箱");
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    await fireEvent.press(screen.getByRole("tab", { name: "音节" }));
    await act(async () => reply({ missingVoice: true }));
    expect(screen.queryByText(/朗读内容/)).toBeNull();
  });

  it("shows the download steps when no Cantonese voice is installed", async () => {
    delivers(OFFLINE);
    speakMock.mockResolvedValue({ missingVoice: true });
    await openTranslate();
    await run("冰箱");
    await fireEvent.press(screen.getByRole("button", { name: "朗读" }));
    expect(screen.getByText(/设置 → 辅助功能 → 朗读内容 → 声音 → 中文 → 粤语/)).toBeTruthy();
  });
});

describe("history", () => {
  it("logs each translation once, with its final result", async () => {
    delivers(OFFLINE, ONLINE);
    await openTranslate();
    await run("冰箱");
    expect(await listHistory(userDb)).toMatchObject([{ kind: "translation", input: "冰箱", output: toHistoryOutput(ONLINE) }]);
  });

  it("doesn't log input that can't be translated", async () => {
    translateMock.mockRejectedValueOnce(new TranslationInputError("empty"));
    await openTranslate();
    await run("  ");
    expect(await listHistory(userDb)).toEqual([]);
  });

  it("reopening a translation from History restores its input and output", async () => {
    await addHistory(userDb, { kind: "translation", input: "冰箱", output: toHistoryOutput(ONLINE) });
    const router = await renderRouter("./app", { initialUrl: "/saved" });
    await fireEvent.press(await screen.findByRole("tab", { name: "历史" }));
    const row = within(await screen.findByTestId("history-1"));
    // History lists the Cantonese, not the stored JSON.
    await fireEvent.press(row.getByText("部雪柜"));
    expect(router.getPathname()).toBe("/translate");
    expect(await screen.findByText("bou6")).toBeTruthy();
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("冰箱");
    expect(screen.getByText("AI")).toBeTruthy();
    expect(translateMock).not.toHaveBeenCalled();
    expect(await listHistory(userDb)).toHaveLength(1);
  });

  it("reopens the same row again after the input was edited", async () => {
    await addHistory(userDb, { kind: "translation", input: "冰箱", output: toHistoryOutput(ONLINE) });
    await openSavedHistory();
    await fireEvent.press(within(await screen.findByTestId("history-1")).getByText("部雪柜"));
    expect(await screen.findByText("bou6")).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), "别的");

    await fireEvent.press(screen.getByRole("button", { name: SAVED_TAB }));
    await fireEvent.press(within(await screen.findByTestId("history-1")).getByText("部雪柜"));
    await flush();
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("冰箱");
  });

  it("keeps a reopened translation when a translate started before it delivers late", async () => {
    await addHistory(userDb, { kind: "translation", input: "冰箱", output: toHistoryOutput(ONLINE) });
    let pending: { onUpdate: OnUpdate; finish: (r: Translation) => void } | undefined;
    translateMock.mockImplementation((_text, onUpdate) => new Promise<Translation>((resolve) => (pending = { onUpdate, finish: resolve })));
    await openTranslate();
    await run("你好");
    await fireEvent.press(screen.getByRole("button", { name: SAVED_TAB }));
    await fireEvent.press(await screen.findByRole("tab", { name: "历史" }));
    await fireEvent.press(within(await screen.findByTestId("history-1")).getByText("部雪柜"));
    expect(await screen.findByText("bou6")).toBeTruthy();

    const late: Translation = { cantonese: "你好", jyutping: ["nei5", "hou2"], source: "offline" };
    await act(async () => {
      pending!.onUpdate(late);
      pending!.finish(late);
    });
    expect(screen.getByText("bou6")).toBeTruthy();
    expect(screen.queryByText("nei5")).toBeNull();
    expect(screen.getByPlaceholderText(PLACEHOLDER).props.value).toBe("冰箱");
  });
});
