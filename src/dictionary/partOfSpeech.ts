// Part-of-speech labels in simplified script for display. The labels are a small closed set (MoE: 名,
// 動, 形, …; words.hk: 名詞, 動詞, 語素, …), so a character map covers them without loading OpenCC.

/** Traditional → simplified for every character that differs in MoE's and words.hk's labels. */
const SIMPLIFIED: Record<string, string> = {
  動: "动",
  詞: "词",
  嘆: "叹",
  歎: "叹",
  綴: "缀",
  連: "连",
  擬: "拟",
  聲: "声",
  語: "语",
  氣: "气",
  數: "数",
  區: "区",
  別: "别",
  專: "专",
  術: "术",
};

/** The label with each mapped character simplified; other characters are kept. */
export function partOfSpeechSimp(pos: string): string {
  return Array.from(pos, (c) => SIMPLIFIED[c] ?? c).join("");
}
