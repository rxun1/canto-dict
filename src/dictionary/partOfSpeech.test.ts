import { partOfSpeechSimp } from "./partOfSpeech";

describe("partOfSpeechSimp", () => {
  it("simplifies every part-of-speech label in canto.db (MoE) and the fixture (words.hk)", () => {
    const labels = ["介", "代", "代、介", "代、助", "副", "助", "動", "名", "嘆", "形", "擬", "歎", "綴", "連", "量"];
    expect(labels.map(partOfSpeechSimp)).toEqual(["介", "代", "代、介", "代、助", "副", "助", "动", "名", "叹", "形", "拟", "叹", "缀", "连", "量"]);
    const wordshk = ["名詞", "副詞", "動詞", "擬聲詞", "詞綴、量詞", "語素"];
    expect(wordshk.map(partOfSpeechSimp)).toEqual(["名词", "副词", "动词", "拟声词", "词缀、量词", "语素"]);
  });

  it("covers the rest of words.hk's labels and leaves unknown characters as they are", () => {
    expect(["形容詞", "連詞", "語氣詞", "感嘆詞", "數詞", "區別詞", "專名", "術語"].map(partOfSpeechSimp)).toEqual([
      "形容词", "连词", "语气词", "感叹词", "数词", "区别词", "专名", "术语",
    ]);
    expect(partOfSpeechSimp("短語")).toBe("短语");
    expect(partOfSpeechSimp("XYZ")).toBe("XYZ");
  });
});
