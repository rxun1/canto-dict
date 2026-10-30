# Free / near-free LLM APIs for Mandarin → colloquial Cantonese (personal iPhone app)

Research date: **2026-10-29**. Free tiers change often, so recheck the linked pages before you rely on any number here.
Use case: one person, about 20–100 short sentences a day, called **directly from a React Native iPhone app** (no backend). The owner signs up for keys personally.

> **How this was researched (and what's missing).** All evidence came from fetching provider docs, arXiv papers and Hugging Face pages directly. No web-search tool was available, and a corporate proxy blocked several provider domains: `console.groq.com`, `groq.com`, `api-docs.deepseek.com`, `openrouter.ai/api`, `siliconflow.cn`, `open.bigmodel.cn` and `build.nvidia.com`. Anything marked **UNVERIFIED** below could not be checked against a primary source this session. Check those from a non-corporate network before you depend on them.

---

## TL;DR recommendation

| Role | Provider + model | Why |
|---|---|---|
| **Default (free)** | **Google Gemini API free tier (AI Studio key)**, `gemini-3.8-flash`, with `gemini-3.5-flash-lite` as an in-provider fallback when you hit a 429 | Best published Cantonese evidence of any model family: Gemini 2.5 Pro tops the HKCanto-Eval leaderboard (87.3 % Cantonese linguistics), and even Gemini 2.0 Flash beats GPT-4o there. The free tier needs no card. There's an OpenAI-compatible endpoint. |
| **Fallback (free, no card)** | **Z.ai `glm-4.7-flash`**, listed "Free" for input and output | Permanently free in the docs. OpenAI-compatible. Reachable from HK and mainland China. Its Cantonese quality isn't benchmarked; the older GLM-4 was mid-pack on Yue-TRANS. |
| **Fallback (near-free, best value if you add $2–5)** | **DeepSeek V4.x Flash**, via DeepSeek's own API or OpenRouter (`deepseek/deepseek-v4.1-flash`) | DeepSeek-V3 is #2 on the HKMMLU Mandarin→Cantonese translation table and DeepSeek-R1 is #2 on HKCanto-Eval. Costs fractions of a cent a day at this volume. |
| **Offline / private** | Ollama on your Mac (`qwen3` or a hon9kon9ize CantoneseLLM GGUF), over Tailscale | Free and private, but only works when the Mac is on. Quality is below the frontier models. |

**Architecture:** yes, build **one OpenAI-compatible client** and make **Base URL + API key + model** (plus a few optional fields) editable in Settings. Every recommended provider exposes `POST {baseURL}/chat/completions` with `Authorization: Bearer <key>`. That lets you change providers without changing code. Generate **Jyutping locally**, using CanCLID `to-jyutping`, not with the LLM; the evidence is below.

---

## 1. Comparison table

"OpenAI-compat" means the provider accepts the standard `/chat/completions` request shape with a Bearer key, so a single client can talk to all of them.

| Provider | OpenAI-compat base URL | Free models (exact IDs) | Free limits | Key / signup | Training / data terms (free tier) | Region notes | Cantonese evidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Google Gemini (AI Studio)** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, Gemma 4 | Per-model RPM/RPD are **no longer published in the docs**; they appear only in AI Studio (`aistudio.google.com/rate-limit`). Limits apply per project and RPD resets at midnight Pacific. | Google account, AI Studio key, no card | **Free-tier data "used to improve our products"**, and human reviewers may read it. Paid tier: not used. | Not offered in **HK, mainland China or Macau**. Fine in the US/EU/UK/TW. | **Strongest**: HKCanto-Eval leaderboard has Gemini 2.5 Pro at 92.1 / 87.3 (culture / linguistics) and Gemini 2.0 Flash at 80.2 / 75.3, both ahead of GPT-4o at 77.5 / 63.8 | **Default** |
| **GitHub Models** | was `https://models.github.ai/inference` | none | none | n/a | n/a | n/a | n/a | **Retired 2026-07-30**. Don't build on it. |
| **Z.ai (Zhipu, international)** | `https://api.z.ai/api/paas/v4/` | `glm-4.7-flash`, `glm-4.5-flash` (both listed "Free" for every price field) | Rate limits not published in docs (console only). UNVERIFIED. | Z.ai account | Not found | Works from HK/China. The China site is `open.bigmodel.cn`. | Older GLM-4 scored 82.82 ROUGE-L on Yue-TRANS (GPT-4o 89.69). No data for GLM-4.7. | **Free fallback** |
| **Zhipu bigmodel.cn (China)** | `https://open.bigmodel.cn/api/paas/v4/` | `glm-4.7-flash`, `glm-4-flash-250414`, `glm-z1-flash` | Concurrency-based, shown in the console | Account; the FAQ says real-name verification is not currently required for the API | Not found | China-hosted | as above | Use Z.ai instead if you're outside China |
| **DeepSeek API** | `https://api.deepseek.com` (from memory, UNVERIFIED) | none free | Pay as you go | Account plus prepaid top-up | DeepSeek ToS (China-hosted). UNVERIFIED. | Works from HK/China | DeepSeek-V3: HKMMLU M→C average 59.5 (#2), ahead of Claude 3.7 (48.3) and GPT-4o (41.1). DeepSeek-R1: 88.8 / 77.5 on HKCanto-Eval. | **Best near-free** |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Current `:free` text models are Nemotron, Inkling, Laguna, Flint, LFM and similar. **No Qwen, DeepSeek, Llama, Gemma, GLM or Kimi `:free` variants.** | 20 RPM. **50 RPD** if you've bought less than $10 of credits; 1000 RPD with $10 or more. | Account; buying $10 of credits raises the cap | Free endpoints often require you to opt in to providers that train on your data | Global | No evidence for the current free models | Useful as a **paid aggregator**, for example DeepSeek V4.1 Flash at about $0.03 / $0.13 per 1M tokens (discounted). Not useful as a free source. |
| **Groq** | `https://api.groq.com/openai/v1` (from memory) | UNVERIFIED. Its catalog as seen on OpenRouter: `llama-3.1-8b`, `llama-3.3-70b`, `gpt-oss-120b/20b`, MiniMax M2.7. **Qwen/Kimi no longer listed.** | UNVERIFIED (docs blocked) | Account, no card (historically) | UNVERIFIED | Global | Llama-3.1-70B: 85.05 ROUGE-L on Yue-TRANS. gpt-oss untested. | Optional extra. Lower quality for Cantonese. |
| **Cerebras** | `https://api.cerebras.ai/v1` | `gpt-oss-120b`, `qwen-3.8-27b` | 5 RPM, 1M tokens a day, but only as a **one-time $5 credit that expires after 30 days**, and it needs a payment method | Card required | n/a | Global | Qwen family is historically weaker on colloquial Cantonese (see §3) | Trial only, not a lasting free tier |
| **SambaNova** | `https://api.sambanova.ai/v1` | `DeepSeek-V3.1`, `Meta-Llama-3.3-70B-Instruct`, `gpt-oss-120b`, `DeepSeek-V3.2`, `gemma-4-31B-it` | **20 RPM / 20 RPD / 200K TPD** per model on the "Free tier (no payment method)". The plans page contradicts this and says you need a card plus credits. | Account (card is ambiguous) | n/a | Global | DeepSeek-V3 is good (see above) | 20 RPD is too low on its own; could be a secondary source of DeepSeek-V3.1 |
| **Cloudflare Workers AI** | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | `@cf/openai/gpt-oss-120b`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/qwen/qwen3-30b-a3b-fp8`, `glm-4.7-flash`, `gemma-4-26b-a4b-it`, … (DeepSeek V4, GLM-5.x and Kimi need paid billing) | **10,000 neurons a day** free. About 100 sentences × ~150 tokens costs roughly 1–3k neurons on gpt-oss-120b (31,818 in / 68,182 out neurons per 1M tokens), so it fits. | Cloudflare account; the URL contains your account ID | Cloudflare terms | Global | No Cantonese evidence for these models | Decent free backup; account ID goes in the base URL |
| **Hugging Face Inference Providers** | `https://router.huggingface.co/v1` | Any routed model | **Free users: no monthly credits.** PRO ($9/month) gets $2. | HF token | Per provider | Global | depends on model | Not free |
| **Mistral** | `https://api.mistral.ai/v1` (from memory) | "Free mode" includes some monthly API usage, but **no numbers are published** (console only). The old "Experiment" plan name is gone. | Unknown | Account | Pricing page shows a "Model training: Opt-out" row | EU-hosted | Mixtral-large-2: 85.71 ROUGE-L on Yue-TRANS. Mistral-Small: HKMMLU M→C average 43.6. | Maybe; check the console |
| **Cohere** | Compatibility API (not checked this session) | Trial key: Command A and similar | **20 RPM, 1,000 calls/month** | Account | n/a | Global | none | Too small and no evidence |
| **Alibaba Model Studio (Qwen, international)** | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | As of **2026-10-29** the new-user free quota was **removed** for qwen-flash/plus/max/turbo, qwen-mt-turbo, all open qwen2.5/3/3.5/3.6 models, deepseek-v4-flash and others | Was 1M tokens per model for 90 days | Alibaba Cloud account | n/a | Singapore/US | Qwen2.5-72B: HKCanto-Eval linguistics 45.9 (weak) | Effectively not free any more |
| **SiliconFlow (.com)** | `https://api.siliconflow.com/v1` | No $0 models on the international site; new users get a **$1 credit**. The .cn site's free Qwen-7B models are UNVERIFIED. | L0: 1,000 RPM | Account (.cn needs a +86 phone and real name for some features) | n/a | .cn is China-focused | Small Qwen models are weak at Cantonese | Skip |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | Many open models | Free "for prototyping" (around 40 RPM); credits UNVERIFIED | NVIDIA developer account | Prototyping-only terms | Global | depends | Allowed for personal tinkering; terms say prototyping only |
| **Ollama on your Mac** | `http://<mac>:11434/v1` | Anything you pull | Unlimited (your hardware) | none | Fully private | n/a | See §3 for Qwen3 and CantoneseLLM | Offline/private option |

---

## 2. Provider details and evidence

### 2.1 Google Gemini API (free tier): recommended default
- **Free models.** The pricing page (`https://ai.google.dev/gemini-api/docs/pricing`, last updated 2026-10-28) marks these as Free Tier "Yes": `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, and Gemma 4. `gemini-4-argon` and `gemini-3.1-pro-preview` are **not** on the free tier ("Gemini 4 Argon is not available on the Free tier").
- **Rate limits.** `https://ai.google.dev/gemini-api/docs/rate-limits` no longer prints per-model numbers. It says "View your active rate limits in AI Studio". Also: "Rate limits are applied per project, not per API key", RPD resets at midnight Pacific, and Free tier qualification is "Active project or free trial". **Action:** after creating the key, open `aistudio.google.com/rate-limit` and check the RPD for `gemini-3.8-flash` and `gemini-3.5-flash-lite`. Flash-Lite models have historically had the larger free daily quota. If Flash allows fewer than ~100 requests a day, make Flash-Lite the default and Flash the "quality" option.
- **OpenAI compatibility.** From `https://ai.google.dev/gemini-api/docs/openai`: base URL `https://generativelanguage.googleapis.com/v1beta/openai/`, with `Authorization: Bearer $GEMINI_API_KEY`, and the docs' example uses `"model": "gemini-3.8-flash"`. `reasoning_effort` accepts `minimal|low|medium|high`, and thinking "can't be turned off for Gemini 2.5 Pro or Gemini 3 models". Use `low` to keep latency down.
- **Data terms.** From `https://ai.google.dev/gemini-api/terms`:
  - Unpaid Services: "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop…"
  - "human reviewers may read, annotate, and process your API input and output."
  - "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
  - Dictionary sentences are fine, but avoid sending private text.
- **Regions.** `https://ai.google.dev/gemini-api/docs/available-regions` does not list Hong Kong, mainland China or Macau; Taiwan is listed. The terms say "You may only access the Services … within an available region." If you're in the US/EU this doesn't matter. If you travel to HK, requests may fail (`FAILED_PRECONDITION` / "User location is not supported"). That's one reason to keep a Z.ai/DeepSeek fallback configured.

### 2.2 GitHub Models: retired
`https://docs.github.com/en/github-models` (fetched 2026-10-29): *"GitHub Models has been retired. As of July 30, 2026, GitHub Models has been fully retired. The playground, model catalog, inference API, and bring your own key (BYOK) are no longer available to any customer."* GitHub points to Azure AI Foundry instead. So the `rxun1` account plus a `models:read` PAT no longer gives you anything.

### 2.3 Z.ai GLM-4.7-Flash: free fallback
- `https://docs.z.ai/guides/overview/pricing.md`: `| GLM-4.7-Flash | Free | Free | Free | Free |` and `| GLM-4.5-Flash | Free | Free | Free | Free |`. GLM-5.3-Flash is paid ($0.15 in / $0.50 out).
- OpenAI-SDK compatible at `https://api.z.ai/api/paas/v4/` (`https://docs.z.ai/api-reference/introduction.md`).
- The China twin, `docs.bigmodel.cn`, lists `glm-4.7-flash`, `glm-4-flash-250414` and `glm-z1-flash` as free. Its FAQ says "目前调用 API 并不强制要求实名认证" ("calling the API does not currently require real-name verification").
- Rate limits are only visible in the console (UNVERIFIED). Cantonese quality is unbenchmarked; test it with your own sentences.

### 2.4 DeepSeek: cheapest strong option (not free)
- Current models on Hugging Face and OpenRouter: V4-Flash, V4-Pro, and **V4.1-Flash(-1017)** (Oct 2026). OpenRouter lists `deepseek/deepseek-v4.1-flash` at **$0.0324 / $0.1296 per 1M tokens** (in/out, shown as a discount) at `https://openrouter.ai/deepseek/deepseek-v4.1-flash/providers`.
- At 100 sentences × ~300 tokens a day that's about 1M tokens a month, **under $0.15/month**. DeepSeek's own price page was blocked (UNVERIFIED).
- Quality evidence: see §3. DeepSeek-V3 is #2 of the tested models on HKMMLU Mandarin→Cantonese.

### 2.5 OpenRouter
- Limits (`https://openrouter.ai/docs/api-reference/limits`): with less than $10 of credits purchased, **20 RPM, 50 RPD**; with $10 or more, **20 RPM, 1,000 RPD**.
- The current free collection (`https://openrouter.ai/collections/free-models`) is NVIDIA Nemotron 3/3.5, Thinking Machines Inkling, Poolside Laguna, Recursive Flint, Liquid LFM, Xing 4.0 and others. **No Qwen or DeepSeek `:free`** (`/qwen` and `/deepseek` pages show none). There's also an `openrouter/free` auto-router.
- Best use: a single paid key that reaches DeepSeek, Gemini, Qwen and others through one OpenAI-compatible URL.

### 2.6 Groq (UNVERIFIED)
Every Groq domain was blocked by the proxy. Indirect evidence (`https://openrouter.ai/provider/groq`): Groq currently serves Llama 3.1 8B, Llama 3.3 70B, gpt-oss-120b/20b and MiniMax M2.7. Qwen and Kimi weren't listed. Groq has historically offered a no-card free plan with per-model daily caps, but that isn't confirmed for late 2026. Even if it's still free, none of those models has strong Cantonese evidence.

### 2.7 Cerebras, SambaNova, Cloudflare, HF, Mistral, Cohere, Alibaba, SiliconFlow, NVIDIA
- **Cerebras.** `https://inference-docs.cerebras.ai/support/rate-limits` lists Free Trial models `gpt-oss-120b` and `qwen-3.8-27b` at 5 RPM and 1M TPD. `https://www.cerebras.ai/pricing`: "Add a valid payment method to receive a one-time $5 promotional credit… The credit expires 30 days after activation."
- **SambaNova.** `https://docs.sambanova.ai/docs/en/models/rate-limits.md`: Free tier "no payment method linked", 20 RPM / **20 RPD** / 200K TPD on DeepSeek-V3.1, Llama-3.3-70B, gpt-oss-120b, DeepSeek-V3.2 and gemma-4-31B-it. `cloud.sambanova.ai/plans` contradicts this ("Add a payment method and purchase credits to run your first requests").
- **Cloudflare Workers AI.** `https://developers.cloudflare.com/workers-ai/platform/pricing/`: "10,000 Neurons per day at no charge", resetting at 00:00 UTC. The OpenAI-compatible URL includes your account ID (`/client/v4/accounts/{account_id}/ai/v1`). DeepSeek V4, GLM-5.x and Kimi K2.6+ need paid billing.
- **Hugging Face.** `https://huggingface.co/docs/inference-providers/pricing`: Free Users get "None" monthly credits; PRO gets $2.00.
- **Mistral.** `docs.mistral.ai/admin/billing-usage/usage-limits.md`: Free mode lets you "create API keys and use included monthly usage within the limits shown on the Limits page". No public numbers.
- **Cohere.** `https://docs.cohere.com/docs/rate-limits`: "Trial keys … are limited to 1,000 API calls a month", 20 RPM for chat.
- **Alibaba Model Studio.** `https://www.alibabacloud.com/help/en/model-studio/new-free-quota` (updated Oct 29, 2026): "The free quotas of some models have been removed by the platform". The list includes `qwen-flash`, `qwen-plus`, `qwen-max`, `qwen-turbo`, `qwen-mt-turbo`, `qwen3-*`, `qwen3.5-*`, `qwen3.6-*` and `deepseek-v4-flash`.
- **SiliconFlow.** The `.com` site has no $0 models and gives a $1 sign-up credit; the `.cn` site is UNVERIFIED.
- **NVIDIA NIM.** Free credits "for prototyping" (`https://developer.nvidia.com/nim`).

### 2.8 Self-hosting on your Mac (Ollama)
- Expose Ollama on the LAN (`https://docs.ollama.com/faq`): `launchctl setenv OLLAMA_HOST "0.0.0.0:11434"`, then restart the Ollama app. Ollama serves an OpenAI-compatible API at `http://<mac-ip>:11434/v1` (any non-empty key works).
- **iOS gotcha:** App Transport Security blocks plain `http://`. Either add `NSAppTransportSecurity → NSAllowsLocalNetworking = YES` to Info.plist, or (better) run **Tailscale** on both devices and use `tailscale serve` to get an HTTPS URL that works away from home. iOS also shows a Local Network permission prompt.
- Models to try:
  - `qwen3:8b` / `qwen3:30b-a3b`.
  - hon9kon9ize CantoneseLLM GGUFs (`ollama run hf.co/mradermacher/CantoneseLLMChat-v1.0-7B-GGUF` or the v2.0 8B/30B-A3B quantized builds).
  - Quality is below Gemini/DeepSeek (see §3), so treat this as an offline/private fallback.

### 2.9 Cantonese-specialised models: no free hosted endpoint
- **hon9kon9ize CantoneseLLM v2.0** (Sept 2026; Qwen3-8B / Qwen3-30B-A3B base, Apache-2.0). The card says "This model isn't deployed by any Inference Provider." Its HKCanto-Eval average is **62.80 vs 67.36 for base Qwen3-8B**, so it trails its own base on that benchmark (`https://huggingface.co/hon9kon9ize/CantoneseLLM-v2.0-8B-Thinking`, arXiv 2609.06970).
- **CantoneseLLMChat v1.0** (7B/32B/72B, Qwen2.5 base). GGUFs exist. All hon9kon9ize HF Spaces show "Runtime error" (`https://huggingface.co/hon9kon9ize`). The org links a chat demo at `chat.hon9kon9ize.com`, but there's no API.
- Others: Llama-3-Cantonese-8B-Instruct, Qwen2-Cantonese-7B-Instruct, and "Liujgoj-Cantonese" (Qwen3/Qwen3.5/Gemma-4 bases). All are self-host only.
- SenseChat-5 (SenseTime) did well on Yue-TRANS, but it's commercial and its API terms couldn't be verified.

---

## 3. Cantonese quality evidence

No published benchmark measures **colloquialness** directly (using 佢/係/嘅/唔/冇/喺/睇 instead of drifting into 書面語), and none covers Gemini 3.x, GPT-5.x, Claude 4.x, Qwen3.5+ or DeepSeek V4. The evidence below is the best available. Run your own 20-sentence comparison before committing.

**A. Yue-Benchmark / Yue-TRANS** (Jiang et al., "How Well Do LLMs Handle Cantonese?", NAACL 2025, `https://arxiv.org/html/2408.16756`, Table 21, Mandarin→Cantonese):

| Model | 0-shot ROUGE-L / BLEU-4 / BERTScore | 5-shot ROUGE-L / BLEU-4 / BERTScore |
|---|---|---|
| GPT-4o | **89.69 / 73.70 / 93.34** | **91.16 / 79.06 / 94.21** |
| SenseChat-5 | 88.92 / 72.78 / 94.00 | 90.94 / 77.65 / 95.05 |
| GPT-4 | 87.11 / 68.25 / 92.52 | 89.24 / 75.65 / 93.92 |
| Mixtral-large-2 | 85.71 / 64.83 / 91.99 | 88.55 / 72.70 / 93.42 |
| Qwen-2.5-72B | 85.11 / 61.81 / 91.78 | 87.90 / 69.39 / 93.28 |
| Llama-3.1-70B | 85.05 / 63.23 / 91.86 | 89.80 / 76.17 / 94.45 |
| GLM-4 | 82.82 / 59.53 / 89.67 | 84.26 / 64.87 / 89.83 |
| Gemma-2-27B | 9.16 / 11.30 / 62.11 | 7.39 / 8.56 / 59.14 |

Takeaways: few-shot examples help every model (put 3–5 examples in the prompt), and Gemini was not tested.

**B. HKCanto-Eval** (hon9kon9ize/HKUST, `https://arxiv.org/html/2503.12440`, plus the updated leaderboard on `https://huggingface.co/hon9kon9ize/CantoneseLLMChat-v1.0-72B`):

| Model | HK culture (0-shot) | Cantonese linguistics |
|---|---|---|
| **Gemini 2.5 Pro** | **92.1 %** | **87.3 %** |
| DeepSeek R1 | 88.8 % | 77.5 % |
| Gemini 2.0 Flash | 80.2 % | 75.3 % |
| GPT-4o | 77.5 % | 63.8 % |
| Claude 3.5 Sonnet | 71.7 % | 63.2 % |
| Qwen2.5-72B-Instruct | 65.9 % | 45.9 % |
| GPT-4o-mini | 55.6 % | 57.3 % |
| Qwen2.5-7B-Instruct | 51.2 % | 30.3 % |

This measures knowledge and understanding of Cantonese, not output style, but the linguistics column is the closest proxy for "knows Cantonese grammar and particles". **This is the main reason to pick Gemini.**

**C. HKMMLU** (`https://arxiv.org/html/2505.02177`, Table 2, Mandarin→Cantonese, BLEU / METEOR / ROUGE-L / average):
- Llama-3-Taiwan-70B: 45.1 / 69.8 / 71.4 / **62.1**
- **DeepSeek-V3**: 41.9 / 67.1 / 69.4 / **59.5**
- Claude 3.7 Sonnet: 29.1 / 57.0 / 58.7 / 48.3
- Qwen2.5-72B: 25.7 / 52.6 / 56.1 / 44.8
- GPT-4o: 20.9 / 49.0 / 53.5 / 41.1

The paper says GPT-4o "performs poorly in the Mandarin-to-Cantonese task". Gemini wasn't tested. Together with B, this supports DeepSeek as the strong cheap fallback.

**D. Jyutping should not come from the LLM.** HKCanto-Eval Table 3 (character → Jyutping CER, lower is better):
- GPT-4o 5.4 %
- Claude 3.5 Sonnet 7.9 %
- GPT-4o-mini 12.0 %
- Gemini 1.5 Pro 15.3 %
- Qwen2 72B 74.0 %
- **Rule-based 0.8 %**

Use a local converter: CanCLID **`to-jyutping`** (JS/TS, `https://github.com/CanCLID/to-jyutping`), ToJyutping (Python), or PyCantonese. If the LLM also returns Jyutping, treat it as a hint only.

**E. Community signal** (thin; Hacker News only, since LIHKG, Reddit and X were unreachable):
- "they do sometimes get confused with Mandarin or go to a more 'formal' Cantonese" (2024, `https://news.ycombinator.com/item?id=41744415`).
- "Until recent months, LLMs couldn't even write a proper children's story in Cantonese without inadvertently code switching to SWC" (2026-02, `https://news.ycombinator.com/item?id=46847735`).

Conclusion: explicitly tell the model to avoid 書面語 and give few-shot examples.

**F. Qwen caveat.** Qwen is Chinese-made but tends to score *lower* on Cantonese linguistics (45.9 % for 72B), and small Qwen models were unstable on Yue-TRANS. Don't assume "Chinese model = better Cantonese".

---

## 4. App design recommendation

1. **One OpenAI-compatible client.** In Settings, store these fields and save presets for Gemini / Z.ai / DeepSeek / OpenRouter / Ollama:
   - `baseURL`
   - `apiKey`
   - `model`
   - optional `reasoning_effort`
   - optional `extraHeaders` (OpenRouter likes `HTTP-Referer` / `X-Title`)
   - "supports JSON mode" toggle
2. **Fallback chain.** On HTTP 429/5xx or a region error, retry once with the next preset, e.g. Gemini Flash → Gemini Flash-Lite → Z.ai GLM-4.7-Flash.
3. **Key storage.** The owner pastes the key at runtime, and it goes into the iOS Keychain (`react-native-keychain` or `expo-secure-store`). Never put a key in the JS bundle or in `.env` files that get compiled into the app; anyone with the IPA can extract those.
4. **Cache translations** locally (keyed by input sentence + model) so repeats are free and work offline.
5. **Prompt.** Use a system prompt with explicit colloquial markers plus 3–5 few-shot pairs (Yue-TRANS shows few-shot helps), and ask for JSON. Run `to-jyutping` on the result locally.

### Suggested prompt
```
System: You translate Mandarin (Standard Written Chinese) into natural, spoken Hong Kong Cantonese written in Traditional characters.
Use colloquial forms: 佢/佢哋, 係, 嘅, 唔, 冇, 喺, 睇, 嘢, 咗, 緊, 啲, 嚟, 俾, 咁, 點解, 邊個, and sentence particles (啦/喎/㗎/囉/啩) where natural.
Never output 書面語 such as 他/是/的/不/沒有/在/看 unless a Cantonese speaker would really say it.
Return ONLY JSON: {"yue": "<Cantonese>", "notes": "<optional short note on word choices>"}
Examples:
他在看书。 -> {"yue":"佢喺度睇書。"}
我没有钱。 -> {"yue":"我冇錢。"}
这是谁的？ -> {"yue":"呢個係邊個嘅？"}
你吃饭了吗？ -> {"yue":"你食咗飯未呀？"}
```

### Sample request: recommended provider (Gemini free tier, OpenAI-compatible)
```bash
curl "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -d '{
    "model": "gemini-3.8-flash",
    "reasoning_effort": "low",
    "temperature": 0.3,
    "response_format": {"type": "json_object"},
    "messages": [
      {"role": "system", "content": "You translate Mandarin into natural spoken Hong Kong Cantonese in Traditional characters (佢/係/嘅/唔/冇/喺/睇…). Avoid 書面語. Return ONLY JSON: {\"yue\": \"...\"}. Examples: 他在看书。-> {\"yue\":\"佢喺度睇書。\"} 我没有钱。-> {\"yue\":\"我冇錢。\"}"},
      {"role": "user", "content": "我们明天去哪里吃饭？"}
    ]
  }'
# Expected shape: choices[0].message.content == "{\"yue\":\"我哋聽日去邊度食飯呀？\"}"
```
Fallback presets use the same body with a different URL, key and model:
- Z.ai: `https://api.z.ai/api/paas/v4/chat/completions`, model `glm-4.7-flash`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`, model `deepseek/deepseek-v4.1-flash`
- Ollama: `http://<mac>:11434/v1/chat/completions`, model `qwen3:8b`

Drop `response_format` for providers that reject it and parse the JSON from the text instead.

---

## 5. Open items to verify (blocked this session)
- Gemini free-tier RPD for `gemini-3.8-flash` / `gemini-3.5-flash-lite` (check AI Studio after signup).
- Groq's free plan models and limits (`console.groq.com/docs/rate-limits`).
- DeepSeek's official prices and native model IDs (`api-docs.deepseek.com/quick_start/pricing`).
- Z.ai free-model rate limits (console).
- Whether `response_format: json_object` works on each provider's OpenAI-compatible layer.
- A hands-on 20-sentence bake-off (Gemini Flash vs Flash-Lite vs GLM-4.7-Flash vs DeepSeek V4.1 Flash), scored on colloquial-marker usage and native-speaker feel. This is the decisive test, because no benchmark covers the 2026 model versions.
