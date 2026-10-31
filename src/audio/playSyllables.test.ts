// playSyllables with clipPath, expo-audio and expo-speech mocked: each player finishes when the
// test says so, and speech finishes at once.
import { createAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { clipPath } from "./syllablePack";
import { playSyllables, TTS_LANGUAGE } from "./playSyllables";

// Syllables without a clip (the particles have none, nor does the loanword syllable rep1).
const mockNoClip = new Set(["la1", "a1", "ga3", "ma3", "rep1"]);
jest.mock("./syllablePack", () => ({
  clipPath: jest.fn(async (s: string) => (mockNoClip.has(s) ? null : `file:///cache/${s}.mp3`)),
}));

interface MockPlayer {
  uri: string;
  play: jest.Mock;
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
    const playing = playSyllables(["sik6", "faan6"], "食飯").then((r) => ((finished = true), r));
    await flush();
    expect(mockPlayers.map((p) => p.uri)).toEqual(["file:///cache/sik6.mp3"]);
    expect(mockPlayers[0].play).toHaveBeenCalled();

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
    expect(Speech.speak).toHaveBeenCalledWith("啦", expect.objectContaining({ language: TTS_LANGUAGE }));
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
});
