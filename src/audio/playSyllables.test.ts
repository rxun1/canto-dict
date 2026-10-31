// playSyllables with clipPath, expo-audio and expo-speech mocked: each player finishes when the
// test says so, and speech finishes at once.
import { createAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { clipPath } from "./syllablePack";
import { MAX_CLIP_MS, playSyllables, speakTts, TTS_LANGUAGE } from "./playSyllables";

// Syllables without a clip (the particles have none, nor does the loanword syllable rep1).
const mockNoClip = new Set(["la1", "a1", "ga3", "ma3", "rep1"]);
jest.mock("./syllablePack", () => ({
  clipPath: jest.fn(async (s: string) => (mockNoClip.has(s) ? null : `file:///cache/${s}.mp3`)),
}));

interface MockPlayer {
  uri: string;
  play: jest.Mock;
  pause: jest.Mock;
  remove: jest.Mock;
  /** Sends a playbackStatusUpdate to the player's listener. */
  emit: (status: { didJustFinish?: boolean; error?: string | null }) => void;
}
const mockPlayers: MockPlayer[] = [];

jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  createAudioPlayer: jest.fn((uri: string) => {
    let listener: (status: object) => void = () => {};
    const player = {
      uri,
      play: jest.fn(),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: (_: string, l: (status: object) => void) => {
        listener = l;
        return { remove() {} };
      },
      emit: (status: object) => listener({ didJustFinish: false, error: null, ...status }),
    };
    mockPlayers.push(player);
    return player;
  }),
}));

jest.mock("expo-speech", () => ({
  speak: jest.fn((_: string, options: { onDone?: () => void }) => options.onDone?.()),
  stop: jest.fn(async () => {}),
  getAvailableVoicesAsync: jest.fn(async () => [
    { identifier: "com.apple.voice.compact.zh-CN.Tingting", language: "zh-CN" },
    { identifier: "com.apple.voice.super-compact.zh-HK.Sinji", language: "yue-HK" },
    { identifier: "com.apple.voice.compact.zh-HK.Aasing", language: "zh-HK" },
  ]),
}));

/** Lets pending promises (clipPath, the play loop) run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("playSyllables", () => {
  beforeEach(() => {
    mockPlayers.length = 0;
    jest.clearAllMocks();
  });

  it("plays the clips in order, waiting for each to finish", async () => {
    let finished = false;
    const playing = playSyllables(["sik6", "faan6"], "食飯").then((r) => {
      finished = true;
      return r;
    });
    await flush();
    expect(mockPlayers.map((p) => p.uri)).toEqual(["file:///cache/sik6.mp3"]);
    expect(mockPlayers[0].play).toHaveBeenCalled();
    // Both clips were ready before the first played, so none is sliced between syllables.
    expect(clipPath).toHaveBeenCalledTimes(2);

    mockPlayers[0].emit({ didJustFinish: true });
    await flush();
    expect(mockPlayers[0].remove).toHaveBeenCalled();
    expect(mockPlayers.map((p) => p.uri)).toEqual(["file:///cache/sik6.mp3", "file:///cache/faan6.mp3"]);
    expect(finished).toBe(false);

    mockPlayers[1].emit({ didJustFinish: true });
    expect(await playing).toEqual({ usedTts: false });
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it("speaks the character of a syllable with no clip and reports usedTts", async () => {
    const playing = playSyllables(["hou2", "la1"], "好啦");
    await flush();
    mockPlayers[0].emit({ didJustFinish: true });
    expect(await playing).toEqual({ usedTts: true });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith(
      "啦",
      expect.objectContaining({ voice: "com.apple.voice.super-compact.zh-HK.Sinji", language: TTS_LANGUAGE }),
    );
  });

  it("matches syllables to the text's Han characters, skipping punctuation", async () => {
    expect(await playSyllables(["a1", "ma3"], "啊，嘛。")).toEqual({ usedTts: true });
    expect((Speech.speak as jest.Mock).mock.calls.map(([text]) => text)).toEqual(["啊", "嘛"]);
  });

  it("stays silent for a missing clip when the characters don't line up with the syllables", async () => {
    expect(await playSyllables(["la1"])).toEqual({ usedTts: false });
    expect(await playSyllables(["rep1", "la1"], "rapper啦")).toEqual({ usedTts: false });
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it("falls back to speech when a clip fails, and never throws", async () => {
    (clipPath as jest.Mock).mockRejectedValueOnce(new Error("pack unreadable"));
    const playing = playSyllables(["sik6", "faan6"], "食飯");
    await flush();
    mockPlayers[0].emit({ error: "decode failed" });
    expect(await playing).toEqual({ usedTts: true });
    expect((Speech.speak as jest.Mock).mock.calls.map(([text]) => text)).toEqual(["食", "飯"]);
    expect(mockPlayers[0].remove).toHaveBeenCalled();

    (createAudioPlayer as jest.Mock).mockImplementationOnce(() => {
      throw new Error("no audio session");
    });
    (Speech.speak as jest.Mock).mockImplementationOnce(() => {
      throw new Error("no voice");
    });
    await expect(playSyllables(["sik6"], "食")).resolves.toEqual({ usedTts: true });
  });

  it("cleans up the player when play() throws, and falls back to speech", async () => {
    (createAudioPlayer as jest.Mock).mockImplementationOnce((uri: string) => {
      const play = jest.fn(() => {
        throw new Error("no audio session");
      });
      const player = { uri, play, pause: jest.fn(), remove: jest.fn(), addListener: () => ({ remove() {} }) };
      mockPlayers.push(player as unknown as MockPlayer);
      return player;
    });
    expect(await playSyllables(["sik6"], "食")).toEqual({ usedTts: true });
    expect(mockPlayers[0].remove).toHaveBeenCalled();
  });

  it("gives up on a clip that never finishes and speaks its character instead", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    try {
      const playing = playSyllables(["sik6"], "食");
      await flush();
      expect(mockPlayers).toHaveLength(1);
      jest.advanceTimersByTime(MAX_CLIP_MS);
      expect(await playing).toEqual({ usedTts: true });
      expect(mockPlayers[0].remove).toHaveBeenCalled();
      expect(Speech.speak).toHaveBeenCalledWith("食", expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops the play in progress when a new one starts", async () => {
    const first = playSyllables(["sik6", "faan6"], "食飯");
    await flush();
    const second = playSyllables(["hou2"], "好");
    await flush();
    expect(mockPlayers[0].pause).toHaveBeenCalled();
    expect(mockPlayers[0].remove).toHaveBeenCalled();
    expect(await first).toEqual({ usedTts: false });

    mockPlayers[1].emit({ didJustFinish: true });
    expect(await second).toEqual({ usedTts: false });
    // The first play never reached faan6, and nothing fell back to speech.
    expect(mockPlayers.map((p) => p.uri)).toEqual(["file:///cache/sik6.mp3", "file:///cache/hou2.mp3"]);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it("stops speech in progress when a new play starts", async () => {
    let endSpeech = () => {};
    (Speech.speak as jest.Mock).mockImplementationOnce((_: string, options: { onStopped: () => void }) => {
      endSpeech = options.onStopped;
    });
    (Speech.stop as jest.Mock).mockImplementationOnce(async () => endSpeech());
    const first = playSyllables(["la1", "a1"], "啦啊");
    await flush();
    const second = playSyllables(["ma3"], "嘛");
    expect(Speech.stop).toHaveBeenCalled();
    expect(await first).toEqual({ usedTts: true });
    expect(await second).toEqual({ usedTts: true });
    // 啊 was never spoken: the first play stopped after 啦.
    expect((Speech.speak as jest.Mock).mock.calls.map(([text]) => text)).toEqual(["啦", "嘛"]);
  });
});

describe("speakTts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("speaks the whole text with the first yue-HK or zh-HK voice", async () => {
    await speakTts("唔使客氣");
    await speakTts("行");
    expect(Speech.speak).toHaveBeenCalledWith(
      "唔使客氣",
      expect.objectContaining({ voice: "com.apple.voice.super-compact.zh-HK.Sinji", language: TTS_LANGUAGE }),
    );
    expect(Speech.speak).toHaveBeenCalledTimes(2);
    // Looked up once per app run (0 calls here when an earlier test already cached it).
    expect((Speech.getAvailableVoicesAsync as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("stops a clip in progress", async () => {
    mockPlayers.length = 0;
    const playing = playSyllables(["sik6"], "食");
    await flush();
    await speakTts("食");
    expect(mockPlayers[0].pause).toHaveBeenCalled();
    expect(await playing).toEqual({ usedTts: false });
  });
});
