// The online translation prompt (spec §6.3): a system prompt plus few-shot pairs, sent as OpenAI-style
// chat messages. The model answers with JSON {"cantonese": "…"}; client.ts parses it.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const SYSTEM_PROMPT = [
  "You translate Mandarin Chinese (simplified or traditional characters) into natural, colloquial Hong Kong Cantonese,",
  "the way people in Hong Kong speak and text: Cantonese words, particles and word order (佢, 冇, 喺, 咗, 緊, 嘢, 啲, 嘅),",
  "not written Chinese read aloud. Write traditional characters as used in Hong Kong. Keep the meaning, tone, names,",
  "numbers and punctuation; do not explain or add anything.",
  'Reply with JSON only, no code fences: {"cantonese": "<translation>"}',
].join(" ");

/** Short Mandarin → Cantonese pairs, shown to the model as earlier turns. */
export const FEW_SHOT: readonly { mandarin: string; cantonese: string }[] = [
  { mandarin: "他今天没有来上班。", cantonese: "佢今日冇返工。" },
  { mandarin: "你吃饭了吗？", cantonese: "你食咗飯未呀？" },
  { mandarin: "这个东西多少钱？", cantonese: "呢樣嘢幾多錢？" },
  { mandarin: "我在等你，快点来吧。", cantonese: "我等緊你，快啲嚟啦。" },
  { mandarin: "我比他高。", cantonese: "我高過佢。" },
];

/** The chat messages asking for `text` in Cantonese. */
export function buildMessages(text: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT.flatMap(({ mandarin, cantonese }): ChatMessage[] => [
      { role: "user", content: mandarin },
      { role: "assistant", content: JSON.stringify({ cantonese }) },
    ]),
    { role: "user", content: text },
  ];
}
