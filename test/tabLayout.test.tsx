// Smoke test: the real app/ routes render with the four tabs, opening on Lookup.
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";

describe("tab layout", () => {
  it("opens on Lookup and shows all four tabs", async () => {
    const router = await renderRouter("./app", { initialUrl: "/" });
    expect(router.getPathname()).toBe("/lookup");
    expect(screen.getByText("查字 Lookup")).toBeTruthy();
    // Tab buttons are labelled "<title>, tab, <n> of 4".
    ["查字", "翻译", "收藏", "设置"].forEach((title, i) => {
      expect(screen.getByRole("button", { name: `${title}, tab, ${i + 1} of 4` })).toBeTruthy();
    });
  });
});

describe("dev checks screen", () => {
  it("runs a check and shows OK", async () => {
    await renderRouter("./app", { initialUrl: "/dev-checks" });
    await fireEvent.press(screen.getByText("Check opencc-js s2t: 学校"));
    expect(screen.getByText("OK 學校")).toBeTruthy();
  });
});
