import { yaleToJyutping } from "../src/yaleToJyutping";

describe("yaleToJyutping", () => {
  describe("tones", () => {
    it.each([
      ["si1", "si1"],
      ["si2", "si2"],
      ["si3", "si3"],
      ["si4", "si4"],
      ["si5", "si5"],
      ["si6", "si6"],
      // Checked (entering) tones: 7 high -> 1, 8 mid -> 3, 9 low -> 6.
      ["sik7", "sik1"],
      ["gok8", "gok3"],
      ["yik9", "jik6"],
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("initials", () => {
    it.each([
      ["bo1", "bo1"],
      ["po1", "po1"],
      ["mo1", "mo1"],
      ["fo1", "fo1"],
      ["do1", "do1"],
      ["to1", "to1"],
      ["no4", "no4"],
      ["lo4", "lo4"],
      ["go1", "go1"],
      ["ko1", "ko1"],
      ["ngo5", "ngo5"],
      ["ho1", "ho1"],
      ["gwo2", "gwo2"],
      ["kwo1", "kwo1"],
      ["wo1", "wo1"],
      ["so1", "so1"],
      ["jo2", "zo2"], // Yale j is Jyutping z
      ["cho1", "co1"], // Yale ch is Jyutping c
      ["yo1", "jo1"], // Yale y is Jyutping j
      ["ou2", "ou2"], // no initial
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("finals", () => {
    it.each([
      ["ha1", "haa1"], // open Yale a is Jyutping aa
      ["haai4", "haai4"],
      ["hai6", "hai6"],
      ["haau1", "haau1"],
      ["hau2", "hau2"],
      ["haam4", "haam4"],
      ["ham4", "ham4"],
      ["haan1", "haan1"],
      ["han4", "han4"],
      ["haang4", "haang4"],
      ["hang1", "hang1"],
      ["haap9", "haap6"],
      ["hap9", "hap6"],
      ["haat8", "haat3"],
      ["hat9", "hat6"],
      ["haak8", "haak3"],
      ["hak7", "hak1"],
      ["he1", "he1"],
      ["hei1", "hei1"],
      ["hem1", "hem1"],
      ["hen1", "hen1"],
      ["heng1", "heng1"],
      ["het9", "het6"],
      ["hek9", "hek6"],
      ["heu1", "hoe1"], // Yale eu is Jyutping oe
      ["heung1", "hoeng1"],
      ["heuk8", "hoek3"],
      ["heui1", "heoi1"],
      ["heun1", "heon1"],
      ["heut7", "heot1"],
      ["hi1", "hi1"],
      ["hip8", "hip3"],
      ["him1", "him1"],
      ["hin1", "hin1"],
      ["hing1", "hing1"],
      ["hit8", "hit3"],
      ["hik7", "hik1"],
      ["hiu1", "hiu1"],
      ["ho1", "ho1"],
      ["hoi1", "hoi1"],
      ["hon1", "hon1"],
      ["hong1", "hong1"],
      ["hot8", "hot3"],
      ["hok8", "hok3"],
      ["hou1", "hou1"],
      ["hu1", "hu1"],
      ["hui1", "hui1"],
      ["hun1", "hun1"],
      ["hung1", "hung1"],
      ["hut8", "hut3"],
      ["huk7", "huk1"],
      ["syu1", "syu1"], // yu after an initial
      ["syun1", "syun1"],
      ["syut8", "syut3"],
      ["m4", "m4"], // syllabic nasals
      ["ng5", "ng5"],
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("eu / eui / eun / eut to Jyutping oe / eoi / eon / eot", () => {
    it.each([
      ["seu4", "soe4"],
      ["seui2", "seoi2"],
      ["cheut7", "ceot1"],
      ["jeuk8", "zoek3"],
      ["jeung1", "zoeng1"],
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("Yale y + u (yu final with no consonant) is Jyutping jyu", () => {
    it.each([
      ["yu5", "jyu5"],
      ["yun4", "jyun4"],
      ["yut9", "jyut6"],
      ["chyun1", "cyun1"],
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("real syllables from the Kaifangcidian data", () => {
    it.each([
      ["mou5", "mou5"], // 冇
      ["mou2", "mou2"],
      ["ge3", "ge3"], // 嘅
      ["ge2", "ge2"],
      ["a1", "aa1"],
      ["ye5", "je5"], // 嘢
      ["gai3", "gai3"],
      ["baan6", "baan6"],
      ["seui2", "seoi2"], // 水
      ["gong2", "gong2"],
      ["cheung4", "coeng4"],
      ["chit8", "cit3"],
    ])("%s -> %s", (yale, jyutping) => {
      expect(yaleToJyutping(yale)).toBe(jyutping);
    });
  });

  describe("unconvertible input is undefined", () => {
    it.each([
      "",
      "mou",
      "mou0",
      "mou10",
      "MOU5",
      "mou5 ",
      "bx1",
      "dz1",
      "ue1",
      "!es1",
      "5",
      "1mou",
    ])("%j", (yale) => {
      expect(yaleToJyutping(yale)).toBeUndefined();
    });
  });
});
