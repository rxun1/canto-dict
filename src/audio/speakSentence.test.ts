// speakSentence with expo-speech and expo-audio mocked, and playSyllables replaced by a mock (the rest of
// ./playSyllables is real, so the voice lookup and speakTts run as in the app). cantoneseVoice caches its
// lookup, so each test loads fresh modules.
import type * as SpeechModule from "expo-speech";
import type * as PlaySyllablesModule from "./playSyllables";
import type * as SpeakSentenceModule from "./speakSentence";

jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  createAudioPlayer: jest.fn(),
}));

jest.mock("./syllablePack", () => ({ clipPath: jest.fn(async () => null) }));

jest.mock("./playSyllables", () => ({
  ...jest.requireActual("./playSyllables"),
  playSyllables: jest.fn(async () => ({ usedTts: false })),
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

// "唔该，OK" as a translation shows it: one Jyutping per code point, null for the comma and the Latin.
const TEXT = "唔该，OK";
const JYUTPING = ["m4", "goi1", null, null, null];

let Speech: typeof SpeechModule;
let playSyllables: jest.Mock;
let TTS_LANGUAGE: string;
let speakSentence: typeof SpeakSentenceModule.speakSentence;

beforeEach(() => {
  jest.resetModules();
  Speech = require("expo-speech");
  ({ playSyllables, TTS_LANGUAGE } = require("./playSyllables") as typeof PlaySyllablesModule & {
    playSyllables: jest.Mock;
  });
  ({ speakSentence } = require("./speakSentence") as typeof SpeakSentenceModule);
});

/** Installed voices for this test: only a Mandarin one. */
const noCantoneseVoice = () =>
  (Speech.getAvailableVoicesAsync as jest.Mock).mockResolvedValueOnce([
    { identifier: "com.apple.voice.compact.zh-CN.Tingting", language: "zh-CN" },
  ]);

describe("speakSentence", () => {
  it("speaks the text with the first yue-HK or zh-HK voice by default", async () => {
    await expect(speakSentence(TEXT, JYUTPING)).resolves.toEqual({ missingVoice: false, usedTts: false });
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledWith(
      TEXT,
      expect.objectContaining({ voice: "com.apple.voice.super-compact.zh-HK.Sinji", language: TTS_LANGUAGE }),
    );
    expect(playSyllables).not.toHaveBeenCalled();
  });

  it("returns { missingVoice: true } instead of speaking when no Cantonese voice is installed", async () => {
    noCantoneseVoice();
    await expect(speakSentence(TEXT, JYUTPING, "voice")).resolves.toEqual({ missingVoice: true });
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it("mode 'syllables' plays the displayed Jyutping, nulls dropped, with the text for the TTS fallback", async () => {
    playSyllables.mockResolvedValueOnce({ usedTts: true });
    await expect(speakSentence(TEXT, JYUTPING, "syllables")).resolves.toEqual({ missingVoice: false, usedTts: true });
    expect(playSyllables).toHaveBeenCalledWith(["m4", "goi1"], TEXT);
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it("mode 'syllables' plays even with no Cantonese voice installed", async () => {
    noCantoneseVoice();
    await expect(speakSentence(TEXT, JYUTPING, "syllables")).resolves.toEqual({ missingVoice: false, usedTts: false });
    expect(playSyllables).toHaveBeenCalledWith(["m4", "goi1"], TEXT);
  });
});
