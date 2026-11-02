// Licenses screen: every data source in spec §4.1 with its license and a link, plus the MoE credit and
// the full MoE usage notes, which must be kept with the data.
import type { ReactNode } from "react";
import { Linking } from "react-native";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { MOEDICT_ATTRIBUTION, MOE_USAGE_NOTES } from "../src/licenses/moe";
import { SOURCES } from "../src/licenses/sources";

jest.mock("../src/db/expoDb", () => {
  const { openTestDb } = jest.requireActual("../src/db/testDb");
  const db = openTestDb();
  return { DbProvider: ({ children }: { children: ReactNode }) => children, useDb: () => db };
});
jest.mock("../src/userdata/expoUserDb", () => require("./helpers/mockUserDb"));
jest.mock("../src/audio/playSyllables", () => ({ playSyllables: jest.fn(), speakTts: jest.fn() }));

// Spec §4.1, row by row: each source and the license the spec gives it.
const SPEC_SOURCES: { name: RegExp; license: RegExp }[] = [
  { name: /rime-cantonese.*char\.csv/, license: /^CC BY 4\.0$/ },
  { name: /LSHK/, license: /^CC BY 4\.0$/ },
  { name: /Unihan/, license: /^Unicode License v3$/ },
  { name: /rime-cantonese.*jyut6ping3\.words/, license: /^CC BY 4\.0$/ },
  { name: /words\.hk.*公开词表/, license: /public domain/ },
  { name: /words\.hk.*完整数据/, license: /^words\.hk NC-ODL 1\.0$/ },
  { name: /开放词典|開放詞典/, license: /^CC BY 3\.0$/ },
  { name: /Wiktionary/, license: /CC BY-SA/ },
  { name: /重編國語辭典/, license: /^CC BY-ND 3\.0 TW$/ },
  { name: /音节录音/, license: /个人使用.*不得再散布/ },
  { name: /HKAllen/, license: /^CC BY 4\.0$/ },
  { name: /raptorkwok/, license: /^CC0$/ },
];

const openLicenses = () => renderRouter("./app", { initialUrl: "/licenses" });

describe("licenses screen", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(SPEC_SOURCES)("credits the §4.1 source $name with its license", ({ name, license }) => {
    expect(SOURCES.some((s) => name.test(s.name) && license.test(s.license))).toBe(true);
  });

  it("lists every source with its license and a link that opens it", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue();
    await openLicenses();
    for (const source of SOURCES) {
      expect(screen.getByText(source.name)).toBeTruthy();
      expect(screen.getByTestId(`license-${source.id}`).props.children).toContain(source.license);
      const link = screen.getByTestId(`link-${source.id}`);
      expect(link.props.accessibilityRole).toBe("link");
      expect(link.props.children).toBe(source.url);
      await fireEvent.press(link);
      expect(openURL).toHaveBeenLastCalledWith(source.url);
    }
  });

  it("shows the MoE credit and the full MoE usage notes", async () => {
    await openLicenses();
    expect(screen.getByText(MOEDICT_ATTRIBUTION)).toBeTruthy();
    for (const paragraph of MOE_USAGE_NOTES) expect(screen.getAllByText(paragraph).length).toBeGreaterThan(0);
  });
});
