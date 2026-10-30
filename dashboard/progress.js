// Single source of truth for dashboard/index.html.
// Loaded as a plain <script> so the dashboard works from file:// without a server.
// status: "done" | "doing" | "todo" | "blocked"
window.CANTO_PROGRESS = {
  updated: "2026-10-29",
  phases: [
    {
      name: "Phase 0 — Discovery & design",
      tasks: [
        { title: "Create project folder + git repo", status: "done", note: "/Users/rxun/Projects/canto-dict" },
        { title: "Research: lexical datasets (字/詞, Jyutping, Mandarin meanings)", status: "done", note: "docs/research/lexical-datasets.md" },
        { title: "Research: real-human pronunciation audio", status: "done", note: "docs/research/audio-datasets.md" },
        { title: "Research: Mandarin → Cantonese translation (offline + OpenAI)", status: "done", note: "docs/research/translation.md" },
        { title: "Research: free LLM APIs for online translation", status: "done", note: "docs/research/free-llm-apis.md" },
        { title: "Clarifying questions with you", status: "done" },
        { title: "Propose 2–3 architecture approaches", status: "done" },
        { title: "Design approved section by section", status: "done" },
        { title: "Write + commit design spec", status: "done", note: "docs/superpowers/specs/2026-10-29-canto-dict-design.md" },
        { title: "Spec reviewed by you", status: "doing" },
        { title: "Implementation plan (writing-plans)", status: "todo" },
      ],
    },
    {
      name: "Implementation phases",
      tasks: [
        { title: "Populated from the implementation plan once the design is approved", status: "todo" },
      ],
    },
  ],
  log: [
    { date: "2026-10-29", text: "Project folder created; three dataset research tracks started in parallel." },
    { date: "2026-10-29", text: "Decided: personal/sideload use, iPhone only, accept both scripts but display simplified, app < 200 MB." },
    { date: "2026-10-29", text: "Decided v1 extras: history, favorites, Jyutping/English search, example sentences." },
    { date: "2026-10-29", text: "Started fourth research track: free LLM APIs instead of paid OpenAI." },
    { date: "2026-10-29", text: "Lexical research done: rime-cantonese + LSHK + Unihan (chars), rime + words.hk (words), Kaifangcidian (Mandarin equivalents), to-jyutping (fallback)." },
    { date: "2026-10-29", text: "Free LLM research done: Gemini API free tier recommended (OpenAI-compatible); Z.ai GLM-4.7-Flash free fallback; GitHub Models retired 2026-07-30." },
    { date: "2026-10-29", text: "Decided: online translation defaults to Gemini free tier, with swappable OpenAI-compatible provider in Settings." },
    { date: "2026-10-29", text: "Audio research done: words.hk syllable set (99.5% token coverage, ~6 MB) + iOS yue-HK TTS for sentences." },
    { date: "2026-10-29", text: "Translation research done: rule-based offline converter beat small on-device models in a rough test (chrF 54 vs 36)." },
    { date: "2026-10-29", text: "Approach A chosen (Expo dev build + prebuilt SQLite). All 5 design sections approved; iOS voice is default sentence read-aloud." },
    { date: "2026-10-29", text: "Design spec written and committed; waiting for your review." },
  ],
};
