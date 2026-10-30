# Mandarin → Cantonese translation (offline + online) research

*Researched 2026-10-29. Scope: translate a Mandarin / Standard Written Chinese sentence (simplified or traditional input) into natural Hong Kong Cantonese characters plus per-character Jyutping, inside a React Native app. Offline is required. An optional online tier uses the user's own OpenAI API key.*

---

## 0. TL;DR

| Tier | What ships | Expected quality (honest) | Size cost | License risk |
|---|---|---|---|---|
| **v1 offline baseline** (ships in the app) | OpenCC-style script normalisation, a curated Mandarin→Cantonese **phrase table** with longest-match replacement, a few dozen **regex grammar rules** (比→過, 先 placement, 畀 word order, 在→喺/緊, 了→咗/喇, A-not-A questions), then **to-jyutping** for Jyutping | Short everyday sentences often come out right. Longer or idiomatic input gives "Cantonese-flavoured written Chinese". Expect roughly 25–50% of short sentences to need no edits, much lower for long ones. Label it in the UI as "quick offline conversion". | < 3 MB total (JS + data) | Low **if** you build your own table from CC0 / CC-BY data. Do **not** bundle the GPL `cmn2yue.dic` or the NC-licensed words.hk data in a closed-source app. |
| **v1.x optional offline download** | One neural model (~0.25–1.3 GB). Pick by license: **(a)** commercial app: fine-tune your own small model (e.g. Qwen3.5-0.8B or 2B, Apache-2.0) on CC-BY/CC0 parallel data (HKAllen 472k pairs, raptorkwok-base 110k pairs), run it with `llama.rn`; **(b)** non-commercial app: ship `hon9kon9ize/bart-translation-zh-yue-onnx` (~220 MB int8, CC-BY-NC-SA) with `onnxruntime-react-native`, or NLLB-200-distilled-600M (CC-BY-NC). | Better fluency than rules, but small models change meaning (they drop clauses, answer the question instead of translating it, keep Mandarin words). Out-of-the-box Qwen3.5 ≤2B was **worse than rules** in my test. Only 4B started to look usable, and it is a 2.7 GB download. | 0.25–2.7 GB download plus 13–35 MB native runtime | The NC licenses (NLLB, BART zh-yue) rule out a paid or ad-supported app. Qwen3.5 is Apache-2.0. |
| **Online tier (user's key)** | OpenAI Responses API, Structured Outputs (JSON schema), model **`gpt-6-luna`** by default (US$0.10 / 1M input tokens, US$0.50 / 1M output) with an optional "quality" model (`gpt-6.1-terra`). The LLM returns **characters only**. Jyutping is always computed locally by to-jyutping. | Best authenticity available. Still check it against the local dictionary (flag Mandarin-only words, simplified characters). | none | None for you. The user pays OpenAI. Store the key with `expo-secure-store` (iOS Keychain / Android Keystore). |

The single biggest design decision is to **always derive Jyutping locally** (to-jyutping, BSD-2-Clause) from the final Cantonese characters, whichever tier produced them. LLM-generated Jyutping is unreliable: a local 4B model got 36 of 49 syllables wrong (§6.3).

---

## 1. Why Mandarin → Cantonese is harder than "swap some characters"

*Beginner context: "Standard Written Chinese" (書面語) is the Mandarin-based written language used in Hong Kong newspapers and schools. Written colloquial Cantonese (粵文/口語) is how people write the way they speak (WhatsApp, LIHKG forums, subtitles on some shows). The two share most characters but differ in:*

1. **Vocabulary**: 是→係, 不→唔, 没有→冇, 他/她→佢, 的→嘅, 在→喺, 看→睇, 吃→食, 喝→飲, 说→講, 东西→嘢, 这/那→呢/嗰, 谁→邊個, 什么→乜嘢, 为什么→點解, 今天/明天/昨天→今日/聽日/琴日, 一起→一齊, 抽烟→食煙.
2. **Grammar and word order**:
   - Comparatives: 我比你高 → 我高過你.
   - Adverb 先: 你先走 → 你行先.
   - Double object: 给我一杯水 → 畀杯水我 (theme before recipient, and the 一 numeral is often dropped).
   - Aspect: 了 → 咗 (perfective) or 喇 (change of state); 在看 → 睇緊 (progressive).
   - Questions: 你会不会 / 你知道…吗 → 你識唔識 / 你知唔知 (A-not-A instead of 吗); 你吃饭了吗 → 你食咗飯未.
   - Classifiers: 一辆车 → 架車 (classifier without 一).
3. **Sentence-final particles** (啦, 喇, 呀, 㗎, 咩, 囉…). They have no 1:1 Mandarin source, so you have to *generate* them.
4. **Word sense depends on context**: 谢谢 becomes 多謝 for a gift but 唔該 for a service. 告诉我 → 話畀我知. 走 can mean 行 ("walk/leave") or 走 ("run away").
5. **Orthography is not standardised**, and there are variant characters. HK-standard 説/爲/裏 vs 說/為/裡. This matters for dictionary lookups (§3.4 pitfall).

This is why pure dictionary substitution plateaus quickly, and why the online LLM tier is worth having.

---

## 2. Hands-on smoke test (run locally for this report)

I could not find a public benchmark covering *all* the candidates. So I ran a small, **non-authoritative** test on a Mac (M-series, CPU/Metal) with:

- **Set A**: 16 everyday sentences. **Caveat:** I wrote the rule table while looking at these, so the rule score is optimistic.
- **Set B**: 12 *held-out* sentences, written after the rule table was frozen. This is the fairer check.
- References are my own colloquial HK Cantonese translations. They have **not** been validated by a native-speaker panel, and many valid alternatives exist. The metric is corpus **chrF** (character n-gram F-score, 0–100, higher is better; punctuation stripped) plus exact-match counts. With 28 sentences, treat differences under about 10 points as noise.

| System | Set A chrF | Set A exact | **Set B chrF (held-out)** | Set B exact | Size |
|---|---|---|---|---|---|
| Identity (OpenCC s2hk only, no translation) | 10.9 | 0/16 | 12.9 | 0/12 | ~1 MB |
| Rules: my ~100-entry core table + 4 regex rules | 65.9* | 6/16 | **54.3** | 3/12 | < 10 KB |
| Rules: `cmn2yue.dic` only (19.5k entries, GPL) | 22.1 | 0/16 | 27.9 | 0/12 | 358 KB |
| Rules: `cmn2yue.dic` + core + regex | 38.7 | 2/16 | 33.9 | 1/12 | 358 KB |
| Qwen3.5-0.8B Q4_K_M, prompted (2-shot) | 17.1 | 1/16 | 10.9 | 0/12 | 533 MB |
| Qwen3.5-2B Q4_K_M, prompted | 18.0 | 1/16 | 20.5 | 0/12 | 1.28 GB |
| Qwen3.5-4B Q4_K_M, prompted | 30.3 | 2/16 | 36.2 | 1/12 | 2.74 GB |
| NLLB-200-distilled-600M (fp32, beam 4, `zho_Hans`→`yue_Hant`) | 35.3 | 3/16 | 25.2 | 2/12 | 2.46 GB fp32 / ~0.6–0.9 GB int8 |

\* Optimistic, because the rules were tuned on Set A.

Not tested: `indiejoseph/bart-translation-zh-yue`, its ONNX export, `botisan-ai/mt5-translate-zh-yue`, `hou000123/zh2yue-translation`, `ERNIE-4.5-0.3B-Yue`. The corporate proxy blocked Hugging Face LFS downloads (`Bloomberg Proxy Exception Page - Access Denied`), and those models are not mirrored on ModelScope. The Qwen GGUFs and NLLB weights came from ModelScope mirrors.

### Representative outputs (held-out Set B)

```
IN   你会不会说广东话？          REF 你識唔識講廣東話？
RULE 你會唔會説廣東話？          (說→講 missed: OpenCC s2hk emitted 説, my table key was 說)
0.8B 我唔會說廣東話，但我會講粵語。 (answered the question instead of translating)
2B   我話廣東話呀。
4B   你會講廣東話嗎？
NLLB 你會話廣東嗎?

IN   你为什么不告诉我？          REF 你點解唔話畀我知？
RULE 你點解唔告訴我？
4B   你點解唔同我講呀？           (good)
NLLB 你點解唔話俾我知?            (good)

IN   那边的人很多，我们走这边吧。  REF 嗰邊好多人，我哋行呢邊啦。
RULE 嗰邊嘅人好多，我哋行呢邊啦。
NLLB 我哋可以走到呢度              (dropped the first clause: meaning loss)

IN   你住在哪里？                REF 你住喺邊度？
RULE 你住喺邊度？
0.8B 我住住住住住住住…             (degenerate repetition)
4B   你喺邊度度？
```

From Set A, the small Qwen models also changed meaning (`你在哪里？` → 0.8B `我喺香港。`, 2B `我喺邊度呀？`), and NLLB inverted one (`便宜一点好不好？` → `太便宜,唔好嗎?`).

**Takeaways**

- A hand-curated rule baseline is competitive with every on-device neural option I could run, and it never invents content. Its failure mode is *under*-translation (leaving Mandarin words in), which is safer than hallucination.
- Generic small LLMs (≤2B) are **not** good Mandarin→Cantonese translators out of the box. They mix in Mandarin (們, 吧, 這, simplified characters), answer instead of translating, and loop. 4B is noticeably better but still makes errors.
- NLLB-600M produces real Cantonese function words (佢/喺/咗/啲/冇) but sometimes drops or inverts clauses. Its own published FLORES-200 score for `zho_Hans-yue_Hant` is chrF++ **16.8** (from Meta's metrics CSV for this checkpoint: <https://dl.fbaipublicfiles.com/large_objects/nllb/models/nllb_200_dense_distill_600m/metrics.csv>, line `zho_Hans-yue_Hant,16.8`; compare `eng_Latn-zho_Hans,19.6`).
- A big general phrase table is **not** automatically better. `cmn2yue.dic` made output worse because of over-eager, slangy, or wrong mappings (§3.1).

---

## 3. Offline option A: rule / dictionary conversion

### 3.1 Existing open-source converters and tables

| Project | What it is | Quality notes (my inspection) | License |
|---|---|---|---|
| **bluebat/msgchi `cmn2yue.dic`**<br><https://github.com/bluebat/msgchi/blob/master/cmn2yue.dic> | 19,582-line `mandarin\|cantonese` phrase table (traditional characters) used by the `msgchi` gettext translator. Also used by AlienKevin's phrase-based experiment. | Broad coverage but noisy. Examples from the file: `一向\|不摟`, `得病\|唔精神`, `號\|碼`. In my test: `不在家→出門`, `好不好→正斗苴斗嘎`, `玩→撚` (vulgar!), `問題→阻滯`. Usable only as a *candidate source* for human curation, not as-is. | **GPL-3.0** (repo `LICENSE`). Bundling it in a closed-source app is a problem. |
| **douglaswzs/mandarin-cantonese-converter**<br><https://github.com/douglaswzs/mandarin-cantonese-converter> | Toy web page: `data.txt` holds a few dozen pairs (`是→係`, `不→唔`, `没有→冇`, `什么→乜嘢`…) with plain replacement | Too small. Demo only. | GPL-2.0 |
| **lenchan139/cantoneseConvertMandarinNodejs**<br><https://github.com/lenchan139/cantoneseConvertMandarinNodejs> | Small Node/Express Cantonese⇄Mandarin demo (2019) | Tiny and unmaintained | GPL-3.0 |
| **AlienKevin/canto_mando_phrased_based_with_gpt**<br><https://github.com/AlienKevin/canto_mando_phrased_based_with_gpt> | Notebook doing phrase-table translation (Cantonese→Mandarin) re-ranked by a Mandarin GPT. Ships `can2man_phrase_table*.txt` (1.2–1.4 MB) derived from cmn2yue + words.hk | Wrong direction (yue→zh), but the phrase tables can be inverted for ideas. Data inherits GPL / words.hk NC terms. | no license file |
| **kiking0501/Cantonese-Chinese-Translation**<br><https://github.com/kiking0501/Cantonese-Chinese-Translation> | 2019–2020 student study: copy-enriched seq2seq + translation-matrix dictionary, then Transformer/GRU NMT on movie transcripts | Research code, not a product | no license |
| **sophia-chingyan/Cantonese_Converter**<br><https://github.com/sophia-chingyan/Cantonese_Converter> | Flask app that calls LLM providers (Poe/Gemini/OpenRouter) to convert 書面語 → 粵文 | Online LLM only. Its README notes "Nobody has published a benchmark for sustained 粵文 generation quality, so this can only be checked by reading real output." | no license |
| **GGJason/CantoneseMandarinWords** | Small categorised word lists (Catering/Foods/Tools) | Tiny | MIT |

GitHub searches for "mandarin cantonese converter", "zh2yue", "普通話 轉 粵語", "cantonese converter", "OpenCC cantonese", and "書面語 粵語" returned **no** mature, maintained, permissively licensed rule-based converter. OpenCC itself only does script and regional-variant conversion (s2hk, s2tw…), not Cantonese vocabulary. **You will be building the rule engine yourself.** It is small, though (my prototype is about 100 lines).

### 3.2 Data you can legally build a phrase table from

| Source | Content | License | Usable in a commercial closed-source app? |
|---|---|---|---|
| **HKAllen/cantonese-chinese-parallel-corpus**<br><https://huggingface.co/datasets/HKAllen/cantonese-chinese-parallel-corpus> | 472,298 `{yue, zh}` sentence pairs (zh in simplified), "most has been improved through manual correction and translation". Paper: Dai et al. 2025, *Next-Level Cantonese-to-Mandarin Translation* (LoResLM). Sampled rows are Wikipedia/news-style. | **CC-BY-4.0** (dataset card) | Yes, with attribution. The best source for mining phrase pairs (word alignment) or fine-tuning. |
| **raptorkwok/cantonese-chinese-parallel-corpus-base**<br><https://huggingface.co/datasets/raptorkwok/cantonese-chinese-parallel-corpus-base> | "130k+ pairs of Cantonese and Traditional Chinese parallel sentences" (datasets-server reports 109,942 train / 6,545 val / 13,743 test). Mixed quality: includes dictionary-gloss pairs like `{"yue": "不可", "zh": "不可、不能"}`. | **CC0-1.0** | Yes |
| raptorkwok/cantonese-chinese-parallel-corpus (CCPC v2) | 160k/20k/5,461 pairs. Test set "translated by a group of professional human translators". Training zh side machine-translated by Bing/DeepSeek V3 from LIHKG, HKCanCor, etc. | CC-BY-NC-SA-4.0 | No (NC) |
| botisan-ai/cantonese-mandarin-translations | Machine-translated parallel corpus (yue ↔ simplified zh) | CC-BY-NC-SA-4.0 | No |
| hon9kon9ize/38k-zh-yue-translation-llm-generated | 38,142 train / 12,170 test. ChatGPT-generated zh sentences, translated by Palm2. "has not undergone manual proofreading". | CC-BY-NC-SA-4.0 | No |
| indiejoseph/yue-zh-translation | 169,949 / 42,361 pairs. Crawled + machine-translated + **includes botisan-ai data and AlienKevin/LIHKG** | Card says CC-BY-4.0, but it re-mixes an NC-SA dataset, so the license is questionable | Risky |
| Paper: *Low-Resource NMT: A Case Study on the Written and Spoken Languages in Hong Kong* (arXiv 2505.17816) | 28K curated pairs + 72K pairs mined from zh/yue Wikipedia. Their zh→yue Transformer "outperforms Baidu Fanyi's Chinese-to-Cantonese translation on 6 out of 8 test sets in BLEU". | Data release not confirmed | n/a |
| meganndare/cantonese-nlp (arXiv 2301.03971) | ~1M monolingual Cantonese sentences + small parallel dev/test sets. Unsupervised MT reached char-BLEU 25.1 (zh→yue) | Google Drive, no license | Unclear |
| **rime/rime-cantonese**<br><https://github.com/rime/rime-cantonese> | Large Cantonese word list with Jyutping (input-method lexicon) | **CC-BY-4.0** | Yes. Good for segmentation and for checking "is this a Cantonese word". |
| **words.hk (粵典)** | Best open Cantonese dictionary, with examples and Jyutping | "Non-Commercial Open Data License 1.0". Section 1(a): "You do not use the Licensed Work for Commercial Purposes" (<https://words.hk/base/hoifong/>) | No, unless you license it separately |
| CC-Canto / CC-CEDICT Cantonese readings (<https://cantonese.org/download.html>) | Cantonese–English dictionary + Jyutping for CC-CEDICT | CC-BY-SA 3.0 | Yes, but share-alike applies to the *data file* you ship |
| HKCanCor (via PyCantonese) <https://github.com/fcbond/hkcancor> | Transcribed spoken Cantonese corpus (POS-tagged, Jyutping) | "released under a CC BY license" | Yes. Good for frequency and particle statistics. |
| ABC Cantonese dictionary examples | Commercial dictionary | Not openly licensed (not pursued) | No |

### 3.3 Recommended rule-engine design (v1)

1. **Normalise script.** Convert input to a *single* traditional form (OpenCC `s2t` or `hk2t`, not `s2hk`). For display, optionally convert the output to HK forms with `t2hk`. `opencc-js` (npm, "MIT AND Apache-2.0", 6 MB unpacked, but you can import only the needed dictionaries) runs in pure JS.
2. **Segment and replace by longest match** using a curated phrase table (start with ~1–3k high-precision entries). Order the entries so that multi-character phrases win (`没有→冇` before `有`, `是不是→係唔係` before `是→係`).
3. **Apply grammar rules** as ordered regex/token rules on the result, in priority order: comparatives (`X比Y+ADJ → X+ADJ+過+Y`), `先` post-position, `畀我+CL+N → 畀+CL+N+我`, `在+V → 喺度+V+緊`, `V+了+O → V+咗+O`, sentence-final `了 → 喇`, `…吗？ → A唔A` for common verbs (知道/会/可以/是/有/要), `…了吗？ → …咗未？`, drop `一` before a classifier.
4. **Add particles** conservatively. For example, imperative `吧 → 啦` and question `呢 → 呢`. Do not invent particles otherwise.
5. **Jyutping**: run `to-jyutping` on the final string (§6).
6. **Mark low-confidence spans.** For example, if the output still contains Mandarin-only words (們, 的, 這, 那, 在, 了, 嗎, 吧, 什麼, 沒) from a stop-list, show a hint like "partially converted. Go online for a natural translation."

**Pitfall I hit:** OpenCC `s2hk` turns 说 into **説** (HK form), so my table key **說** never matched (`你會唔會説廣東話`). Normalise both the table keys and the input with the same OpenCC config.

**Building the table:** mine candidate pairs from HKAllen (CC-BY) and raptorkwok-base (CC0) using word alignment (e.g. `fast_align` / `eflomal` on character-segmented text, or simply diffing aligned sentence pairs). Count the frequency of each zh-phrase → yue-phrase pair. Then have a native speaker approve the top ~2–5k. You can use `cmn2yue.dic` only as a *checklist of ideas* that a human re-authors, never copied wholesale, because of GPL-3.0.

**Expected quality:** good for short conversational sentences that only need common substitutions and a handful of patterns. Poor on idioms, register (news-style input), word-sense choices (谢谢→多謝/唔該), long-distance reordering, and particles. Be explicit in the UI that this is a quick conversion.

---

## 4. Offline option B: small seq2seq neural MT models

*Beginner context: a "seq2seq" (encoder–decoder) model like BART, mT5, Marian, or NLLB reads the whole source sentence and then writes the translation token by token. "Quantized int8/int4" means the weights are stored in 8-bit or 4-bit integers instead of 32-bit floats, making the file 4–8× smaller with a small quality loss. ONNX and GGUF are file formats that mobile runtimes can load.*

| Model | Params / files | Training data & quality evidence | License | RN path |
|---|---|---|---|---|
| **indiejoseph/bart-translation-zh-yue**<br><https://huggingface.co/indiejoseph/bart-translation-zh-yue> | BART-base (fnlp/bart-base-chinese → bart-base-cantonese). `model.safetensors` 561 MB fp32. | ~40k sentences generated by ChatGPT, translated by Palm2 "while dedicating attention to manually rectifying any typos". Eval BLEU **36.35** on a similarly synthetic eval set. The card's own example output (news paragraph) is fluent HK Cantonese (`市議會喺11月29號宣佈破產，係繼…`). Known quirk: the whitespace tokenizer inserts spaces between characters (the card uses a custom pipeline). | **CC-BY-NC-SA-4.0** | ONNX export already exists (next row). Tokenizer is BERT WordPiece (`vocab.txt`), which for Chinese is essentially one token per character, so it is **trivial to reimplement in JS**. |
| **hon9kon9ize/bart-translation-zh-yue-onnx**<br><https://huggingface.co/hon9kon9ize/bart-translation-zh-yue-onnx> | `encoder_model_quantized.onnx` 83.2 MB + `decoder_model_quantized.onnx` 137.4 MB (+ `decoder_with_past_model_quantized.onnx` 130.2 MB for KV-cache) | ONNX/Optimum export of the above | **CC-BY-NC-SA-4.0** | `onnxruntime-react-native`. You write the greedy/beam decode loop in JS (encoder once, then decoder per token). About **220–350 MB** download. Best size/quality *if* non-commercial. |
| **facebook/nllb-200-distilled-600M**<br><https://huggingface.co/facebook/nllb-200-distilled-600M> | 600M. fp32 2.46 GB. CTranslate2 int8 single file **622.6 MB** (`JustFrederik/nllb-200-distilled-600M-ct2-int8`). ONNX quantized (Xenova) `encoder_model_quantized` 419 MB + `decoder_model_merged_quantized` 475.5 MB ≈ 0.9 GB (the 256k-token embedding table is duplicated across files). | Supports `yue_Hant`. FLORES chrF++ `zho_Hans-yue_Hant` **16.8**. My test: real Cantonese function words, some clause drops and one inversion. 0.5–1 s per sentence on a Mac CPU in fp32. | **CC-BY-NC-4.0** ("License: CC-BY-NC" on the card) | ONNX via `onnxruntime-react-native` (needs a SentencePiece tokenizer in JS). CTranslate2 has **no RN binding**. Vocabulary trimming (keep only CJK tokens) could cut size a lot, but that is non-trivial. |
| facebook/nllb-200-distilled-1.3B | 5.48 GB fp32 | Better than 600M in general | CC-BY-NC-4.0 | Too big for phones |
| **botisan-ai/mt5-translate-zh-yue**<br><https://huggingface.co/botisan-ai/mt5-translate-zh-yue> | mT5-base, 2.33 GB fp32 (~600 MB int8) | Trained on botisan-ai/cantonese-mandarin-translations. "we do not have any training results yet." Prefix `translate mandarin to cantonese: ` | Apache-2.0 *weights*, but trained on CC-BY-NC-SA data | ONNX export possible. Large, with no quality evidence. |
| indiejoseph/mbart-translation-zh-yue | mBART, 2.44 GB | Card is empty ("More information needed") | MIT | Too big, unknown quality |
| **hou000123/zh2yue-translation**<br><https://huggingface.co/hou000123/zh2yue-translation> | MarianMT (6+6 layers, d_model 512, ~77M params). `model.safetensors` 310 MB fp32 → ~80 MB int8 | Fine-tuned from `Helsinki-NLP/opus-mt-zh-en` on `indiejoseph/yue-zh-translation`. README example `今天天气很好 → 今日天氣好好`. No evaluation. **Untested.** Possible issue: the target SentencePiece of opus-mt-zh-en is English-oriented. | MIT (base opus-mt-zh-en is CC-BY-4.0; the data's provenance is questionable, see §3.2) | Smallest candidate. ONNX export + ORT. Worth a quick eval before relying on it. |
| HaohuaLv/mt5_large-lora_rank_16-yue_zh_translation | LoRA adapter (19 MB) for mT5-large | Wrong direction (yue→zh) | openrail | n/a |
| Helsinki-NLP opus-mt | No zh→yue model. `opus-mt-en-zh` lists `yue_Hant` as a *target token* but takes English source only. | n/a | Apache-2.0 / CC-BY | Not applicable |
| *Novel TTS-frontend NAR model* (arXiv 2206.04922) | Non-autoregressive Mandarin→Cantonese translation for TTS; "+2.56 BLEU" | Paper only | n/a | n/a |

**Bottom line for seq2seq:** the only ready-to-run, phone-sized zh→yue model is the **BART zh-yue ONNX (~220–350 MB)**, and it is **NC-SA**. NLLB works but is roughly 0.6–0.9 GB, NC-licensed, and drops clauses. A clean commercial path means fine-tuning your own (§8).

---

## 5. Offline option C: small on-device LLMs

| Model | Size (Q4) | Cantonese evidence | License |
|---|---|---|---|
| **Qwen3.5-0.8B / 2B / 4B** (Feb 2026)<br><https://huggingface.co/Qwen/Qwen3.5-2B> | GGUF Q4_K_M: **533 MB / 1.28 GB / 2.74 GB** (`unsloth/Qwen3.5-*-GGUF`) | My test (§2): 0.8B and 2B are poor (meaning changes, Mandarin leakage, loops). 4B is usable-ish (held-out chrF 36.2). | **Apache-2.0** |
| Qwen2.5-0.5B/1.5B, Qwen3-0.6B/1.7B | ~0.4–1.3 GB | Older generation than 3.5. Expect similar or worse. | Apache-2.0 |
| **hon9kon9ize/ERNIE-4.5-0.3B-Yue**<br><https://huggingface.co/hon9kon9ize/ERNIE-4.5-0.3B-Yue> | 721 MB bf16 safetensors (~200 MB Q4 after conversion) | CPT on HK corpus + SFT. The card lists "translations (e.g. from English/Mandarin to local Cantonese expressions)" as an intended use. Benchmarks are knowledge-oriented (CantoMMLU 0.328, HK Law 0.743). No translation metric. **Untested.** | card says `other`. Base ERNIE-4.5-0.3B is Apache-2.0. |
| hon9kon9ize/CantoneseLLM-v2.0-8B-Thinking / 30B-A3B (2026) | 8B ≈ 5 GB Q4 | The v2 tech report says SFT was "meant to install… translation between written Chinese and Cantonese". Strong, but too big for phones. | see repo |
| CantoneseLLMChat-v1.0-7B, Qwen2-Cantonese-7B, Llama-3-Cantonese-8B, Liujgoj-Cantonese-Qwen3-8B / Gemma-4-12B | 4–8 GB | 7–12B class | various |
| Hercules628/gemma-3-1b-Mandarin-Cantonese-FineTuned* | 104 MB LoRA adapter on Gemma-3-1B | 0 downloads, no card details | Apache-2.0 (Gemma terms for the base) |
| hon9kon9ize/cantonese-gemma-2-2b-lora-preview20240929 | LoRA for Gemma-2-2B | Preview | Gemma terms |

**Phone speed reference.** Measured by Software Mansion for react-native-executorch, from `docs/docs/04-benchmarks/measured.json` in <https://github.com/software-mansion/react-native-executorch>. Tokens/s are decode speed. A 20-character Cantonese sentence is about 20–35 output tokens.

| Model (ExecuTorch) | iPhone 17, MLX int4 | Galaxy S24, XNNPACK 8da4w | Galaxy S20+, XNNPACK | File size |
|---|---|---|---|---|
| qwen2.5-0.5B | 157.5 tok/s | 100.3 tok/s | 52.3 tok/s | 419–517 MB |
| qwen3-0.6B | 83.9 (int8) | 81.0 | 40.5 | 505–894 MB |
| qwen2.5-1.5B | 60.0 | 38.0 | 19.2 | 1.1–1.2 GB |
| qwen3-1.7B | 55.6 | 35.5 | 18.8 | 1.26–1.48 GB |
| qwen3-4B | 22.6 | 15.8 | 8.6 | 2.6–2.8 GB |

So even a 4B model translates one sentence in about 1–3 s on a 2024+ flagship, and the ≤1.7B ones in under 1 s. The binding constraints are **download size, RAM (peak 0.9–4 GB), and quality**, not latency.

**Bottom line for LLMs:** generic small LLMs are not good enough at ≤2B. A **fine-tuned** 0.8–2B model trained on tens of thousands of clean zh→yue pairs would probably beat both rules and NLLB. That is plausible from the BART-base result (36 BLEU from 40k synthetic pairs) but **not verified**. The fine-tune is the most promising license-clean offline upgrade (§8).

---

## 6. Jyutping (all tiers)

### 6.1 Options

| Library | Platform | Quality evidence | License |
|---|---|---|---|
| **to-jyutping** (npm 3.1.1, 1.28 MB unpacked)<br><https://github.com/CanCLID/to-jyutping> | Pure JS/TS: `getJyutpingList`, `getJyutpingText`, `getJyutpingCandidates`, and `customize({...})` for overrides | README claims "an accuracy rate of 99%" (general text). On hon9kon9ize's **polyphonic-character** benchmark: **90.79% accuracy, PER 0.0305** (vs PyCantonese 83.83%, g2pW-Cantonese 91.17%). <https://github.com/hon9kon9ize/yue-g2p-benchmark> (result.png) | **BSD-2-Clause** |
| ToJyutping (PyPI) | Python twin of the above. Useful for build-time checks. | same | BSD-2-Clause |
| PyCantonese | Python | 83.83% on the same benchmark | MIT |
| g2pW-Cantonese (BERT) | Python/ONNX | 91.17%, but the benchmark repo warns the referenced ONNX build "has been reported to have a backdoor threat" | — |
| rime-cantonese lexicon | Data (word → Jyutping) | Large, community-curated | CC-BY-4.0 |

Example (run locally): `ToJyutping.get_jyutping_text("呢樣嘢幾多錢")` → `ni1 joeng6 je5 gei2 do1 cin2`.

### 6.2 Per-character output

Use `getJyutpingList(text)`. It returns `[[char, jyutping|null], …]`, so you can render ruby text (Jyutping above each character) directly. Punctuation comes back as `null`. Use `getJyutpingCandidates` to show alternative readings when a user taps a character. Use `customize({詞: "jyut ping"})` to fix known errors from your own word list.

### 6.3 Why not let the LLM write the Jyutping?

I asked the local Qwen3.5-4B for Jyutping of six correct Cantonese sentences and compared it with to-jyutping: **36 of 49 syllables differed**. Examples: `佢→goi1` (should be keoi5), `喺→hei1` (hai2), `啱啱→ging1 ging1` (ngaam1 ngaam1), `聽日→sang1 zeoi2` (ting1 jat6). Frontier cloud models are far better than a 4B model (not measured here, since I had no API key), but Jyutping is still a memorisation task where any slip produces a wrong tone. A deterministic dictionary is cheaper, consistent, and works offline. **Design rule:** the LLM produces characters only, and Jyutping always comes from to-jyutping. Optionally, ask the LLM for readings *only* for words to-jyutping returns `null` for, and show those flagged.

---

## 7. React Native on-device runtimes

| Runtime | Fits which model | Integration notes | App-size impact | License |
|---|---|---|---|---|
| **onnxruntime-react-native** 1.24.x (npm) <https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html> | BART / Marian / NLLB / mT5 exported to ONNX | `import * as ort from 'onnxruntime-react-native'`. Needs a dev build (not Expo Go). You implement tokenizer + decode loop in JS. Optional ORT-Extensions via `"onnxruntimeExtensionsEnabled": "true"` in package.json. | Android arm64 `libonnxruntime.so` = **34.2 MB** uncompressed (~12.9 MB gzipped), measured from `onnxruntime-android-1.31.1.aar`. Can shrink with a custom ops-only build. | MIT |
| **llama.rn** 0.13 (npm) <https://github.com/mybigday/llama.rn> | Any GGUF LLM (Qwen3.5, fine-tunes) | Requires New Architecture. Has an Expo config plugin. Metal on iOS, OpenCL/Hexagon on Android. Supports **GBNF / JSON-schema constrained output**. | Native libs of roughly 10–20 MB per ABI (llama.cpp macOS dylibs total ~16 MB for comparison) | MIT |
| **react-native-executorch** 0.11 <https://github.com/software-mansion/react-native-executorch> | Pre-exported LLMs (Qwen2.5/3, Llama 3.2, LFM2.5, Gemma 4…) or custom `.pte` | Requires New Architecture, RN 0.83+ / Expo SDK 55+ dev build, iOS 17+ / Android 13+. `useLLMChatSession(models.llm.…)`. Sends an anonymous download-telemetry event (`setTelemetryEnabled(false)` to opt out). | ExecuTorch runtime (npm unpacked 10 MB). Benchmarks above. | MIT |
| @react-native-ai/mlc (callstack) <https://github.com/callstackincubator/ai> | MLC-compiled LLMs | Vercel AI SDK compatible | npm package is 179 MB unpacked (includes prebuilt libs) | MIT |
| react-native-fast-tflite <https://github.com/margelo/react-native-fast-tflite> | TFLite models | Seq2seq generation loops in TFLite are awkward. No zh→yue TFLite model exists. | small | MIT |
| CTranslate2 | NLLB / Marian (fastest CPU MT engine) | **No React Native binding** (only an unofficial Android build repo, `jemenn/ctranslate2-android-build`, 0 stars). You would need custom JSI/Turbo-module work. | — | MIT |

*Beginner context: "New Architecture" is React Native's newer native-module system (JSI/TurboModules/Fabric). Libraries with heavy C++ (llama.rn, executorch) require it. "Dev build" means you compile your own app binary instead of using the Expo Go sandbox app. Expo Go can't load custom native code.*

**Delivering big models:** never put a 0.2–2.7 GB model in the app binary. Download it on demand (on Wi-Fi, with a progress UI) to the app's document directory (e.g. `expo-file-system` / `react-native-blob-util`), verify a SHA-256, and allow deletion. Apple's On-Demand Resources / Google Play Asset Delivery are alternatives.

---

## 8. Recommended offline roadmap

1. **v1 (ships):** rules + curated table + to-jyutping (§3.3). Under 3 MB, instant, and no license problems if the table is self-authored from CC0/CC-BY data.
2. **v1.x optional download, commercial-safe:** fine-tune **Qwen3.5-0.8B** (or 2B for better quality) on HKAllen (472k, CC-BY-4.0) + raptorkwok-base (110k, CC0). Filter out Wikipedia-style long sentences, keep conversational ones, add your curated table as extra pairs. Optionally distil from GPT outputs, but check the OpenAI terms on using outputs to train models first. Quantize to Q4_K_M GGUF (~0.5 / 1.3 GB) and run with `llama.rn` using a fixed prompt and grammar-constrained output. Then evaluate against the CCPC human-translated test set (5,461 pairs, NC licence is fine for internal evaluation) and a native-speaker review. Ship only if it clearly beats the rules.
   - Alternative small model: fine-tune a Marian or BART-base on the same CC-BY data, export to ONNX int8 (~80–150 MB), and run with ORT. Smaller download, but you write the decoder loop yourself.
3. **If the app is strictly non-commercial:** you can offer `hon9kon9ize/bart-translation-zh-yue-onnx` (~220 MB) right away under CC-BY-NC-SA (attribution + share-alike + non-commercial). Evaluate it first; I could not download it through the proxy.
4. **Always post-process neural output:** run the rule engine's "Mandarin leftovers" detector, convert any simplified characters to traditional (OpenCC), and compute Jyutping locally.

---

## 9. Online tier: OpenAI with the user's own key

### 9.1 Model choice and cost (from <https://developers.openai.com/api/docs/pricing>, Standard tier, per 1M tokens)

| Model | Input | Cached input | Output | Notes |
|---|---|---|---|---|
| **gpt-6-luna** | $0.10 | $0.01 | $0.50 | "Our most efficient model for focused, high-volume tasks." Supports structured outputs, streaming, prompt caching. `reasoning.effort` accepts `none` … `max` (default `medium`). Knowledge cutoff May 18 2026. (<https://developers.openai.com/api/docs/models/gpt-6-luna>) |
| gpt-6.1-terra | $1.00 | $0.05 | $5.00 | "clear, natural writing". Use as an opt-in "best quality" setting. |
| gpt-5-nano | $0.05 | $0.005 | $0.40 | Cheapest overall, older generation |
| gpt-5.4-mini / gpt-5.4-nano | $0.75 / $0.20 | | $4.50 / $1.25 | |

Estimated cost per translation with `gpt-6-luna`, `reasoning.effort: "none"`: ~350 input tokens (system prompt + few-shot + sentence) and ~80 output tokens works out to 350×$0.10/1M + 80×$0.50/1M ≈ **$0.000075**, or about 13,000 translations per US$1 (less with prompt caching, which applies to the repeated system prompt). If you leave reasoning on, reasoning tokens are billed as output, so set effort to `none` or `low` for this task.

*I did not have an API key, so I could not measure GPT translation quality. Run the §2 sentences plus the CCPC test set through the chosen model before launch. Independent evidence that frontier models lead on Cantonese but still struggle with colloquialisms: arXiv 2511.10664 ("all models struggle… such as… Cantonese colloquialisms"). arXiv 2408.16756 (Yue-TRANS) recommends GPT-4-class models for Mandarin→Cantonese conversion.*

### 9.2 Request shape (Responses API + Structured Outputs)

Structured Outputs: `text.format = { type: "json_schema", name, schema, strict: true }`. Docs: "all fields or function parameters must be specified as `required`" and "set `additionalProperties: false`" (<https://developers.openai.com/api/docs/guides/structured-outputs>).

```ts
// Minimal sketch: plain fetch works in React Native; no SDK needed.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cantonese", "alternatives", "notes"],
  properties: {
    cantonese: { type: "string", description: "Natural spoken Hong Kong Cantonese, Traditional characters" },
    alternatives: { type: "array", items: { type: "string" }, description: "0-2 other natural phrasings" },
    notes: { type: "string", description: "Brief English note on word choices, or empty string" },
  },
};

const SYSTEM = [
  "You translate Standard Written Chinese / Mandarin into natural, colloquial Hong Kong Cantonese as people actually speak it.",
  "Rules: use Traditional characters (HK forms); use Cantonese vocabulary and grammar (係, 唔, 冇, 佢, 喺, 嘅, 咗, 緊, 啲, 畀, 睇, 食, 講, 嘢, 點解, 邊個, 乜嘢);",
  "use Cantonese word order (我高過你, 你行先, 畀杯水我); add sentence-final particles only where natural;",
  "keep the meaning exactly - never answer or comment on the sentence, just translate it; keep names, numbers and English words as-is.",
  "Do NOT output Jyutping.",
].join("\n");

async function translateOnline(apiKey: string, zh: string, model = "gpt-6-luna") {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "none" },
      input: [
        { role: "system", content: SYSTEM },
        // few-shot pairs teach register better than instructions alone
        { role: "user", content: "你吃过饭没有？" },
        { role: "assistant", content: JSON.stringify({ cantonese: "你食咗飯未呀？", alternatives: [], notes: "" }) },
        { role: "user", content: "给我一杯水。" },
        { role: "assistant", content: JSON.stringify({ cantonese: "畀杯水我。", alternatives: ["唔該畀杯水我。"], notes: "唔該 adds politeness" }) },
        { role: "user", content: zh },
      ],
      text: { format: { type: "json_schema", name: "yue_translation", schema: SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`); // 401 = bad key, 429 = quota/rate limit
  const data = await res.json();
  // Inspect for refusal / incomplete status, then read the output text item and JSON.parse it.
  return data;
}
```

Then run `ToJyutping.getJyutpingList(result.cantonese)` locally.

### 9.3 Prompting best practices and caveats

- **Few-shot beats long instructions** for register. Keep 3–6 short pairs covering 咗/緊/未/A-not-A/比較/畀 word order. Put them in the stable prefix so prompt caching kicks in.
- **Ask for characters only.** Derive Jyutping locally (§6.3).
- **Guard against the common LLM failures** seen in testing and in the literature: simplified-character leakage (run OpenCC `s2hk` on the output anyway), Mandarin words left in (run the same leftovers detector as offline), answering instead of translating (the "never answer" rule, plus a length-ratio sanity check), and over-slangy or vulgar output (add "neutral, everyday register; avoid vulgar slang" if your audience needs it).
- **Offer a register toggle** ("colloquial" vs "semi-formal") instead of trying to guess.
- **Handle errors:** 401 means invalid key (send the user to settings), 429 means quota or rate limit, a network failure means fall back to the offline result automatically.
- **Privacy:** tell the user their text is sent to OpenAI under their own account.

### 9.4 Storing the user's API key

- Use **`expo-secure-store`** (`setItemAsync` / `getItemAsync` / `deleteItemAsync`). From the docs (<https://docs.expo.dev/versions/latest/sdk/securestore/>): iOS stores values in the Keychain as `kSecClassGenericPassword`, and Android stores them in SharedPreferences "encrypted with Android's Keystore system". The iOS default accessibility is `WHEN_UNLOCKED`. Android data is wiped on uninstall, while iOS Keychain items "will persist across app uninstallations" (don't rely on either). The optional `requireAuthentication` adds biometrics. Non-Expo alternative: `react-native-keychain` (MIT, v10).
- Never put the key in AsyncStorage, Redux persist, logs, crash reports, or analytics. Mask it in the UI (show the last 4 characters), provide "Remove key", and validate it once with a cheap call (e.g. `GET /v1/models`).
- Calling OpenAI directly from the device is acceptable here **because the key belongs to the user**. Never ship *your own* key in the app. If you ever offer a hosted tier, proxy it through your backend instead.

---

## 10. Master comparison table

| Option | Type | Size on device | Latency (phone) | Quality (Mandarin→colloquial yue) | License | RN path | Verdict |
|---|---|---|---|---|---|---|---|
| Curated table + regex + to-jyutping | Rules | < 3 MB | < 10 ms | OK for short everyday sentences, weak beyond | Self-authored + CC0/CC-BY sources; to-jyutping BSD-2 | Pure JS | **v1 baseline** |
| bluebat `cmn2yue.dic` | Phrase table | 358 KB | < 10 ms | Noisy; made output worse in test | GPL-3.0 | Pure JS | Ideas only |
| hon9kon9ize BART zh-yue ONNX | Seq2seq | ~220–350 MB | ~0.2–1 s (est.) | Fluent in card examples; BLEU 36 on synthetic eval; untested here | CC-BY-NC-SA-4.0 | onnxruntime-react-native | Non-commercial download option |
| NLLB-200-distilled-600M | Seq2seq | ~0.6–0.9 GB int8 | ~0.5–1.5 s (est.) | Real Cantonese words, clause drops; FLORES chrF++ 16.8 | CC-BY-NC-4.0 | ORT (+ JS SentencePiece) | Not recommended (NC, big) |
| botisan mT5-base zh-yue | Seq2seq | ~0.6 GB int8 | ~1 s | No metrics | Apache-2.0 weights / NC data | ORT | Skip |
| hou000123 Marian zh2yue | Seq2seq | ~80 MB int8 | < 0.3 s | Unknown | MIT (data provenance questionable) | ORT | Quick eval candidate |
| Qwen3.5-0.8B / 2B (generic) | LLM | 0.53 / 1.28 GB | < 1 s | Poor: meaning changes, loops | Apache-2.0 | llama.rn / executorch | Not without fine-tuning |
| Qwen3.5-4B (generic) | LLM | 2.74 GB | 1–3 s | Fair | Apache-2.0 | llama.rn | High-end opt-in only |
| **Fine-tuned Qwen3.5-0.8B/2B on CC-BY/CC0 pairs** | LLM | 0.53–1.28 GB | < 1 s | Likely > rules (unverified) | Apache-2.0 + CC-BY attribution | llama.rn | **Best offline upgrade** |
| ERNIE-4.5-0.3B-Yue | LLM | ~0.2 GB Q4 | < 0.5 s | Untested; Cantonese-adapted | "other" (base Apache-2.0) | llama.rn after GGUF conversion | Worth a quick eval |
| OpenAI `gpt-6-luna` | Cloud LLM | 0 | ~1 s network | Best available (verify) | User's account | fetch + expo-secure-store | **Online tier default** |
| OpenAI `gpt-6.1-terra` | Cloud LLM | 0 | ~1–2 s | Higher | User's account | same | Optional "quality" |

---

## 11. License caveats (summary)

- **NC licenses block monetised apps:** NLLB-200 (CC-BY-NC-4.0), indiejoseph/hon9kon9ize BART zh-yue (CC-BY-NC-SA-4.0), words.hk (Non-Commercial Open Data License), CCPC v2 / botisan / hon9kon9ize-38k datasets (CC-BY-NC-SA). Ads and paid tiers count as commercial.
- **Copyleft:** `cmn2yue.dic` (GPL-3.0), douglaswzs (GPL-2.0). Don't bundle them in a closed-source app. CC-Canto (CC-BY-SA 3.0) requires the shipped data file to stay share-alike.
- **Permissive:** to-jyutping / ToJyutping (BSD-2-Clause, keep the notice), OpenCC (Apache-2.0) / opencc-js (MIT AND Apache-2.0), rime-cantonese (CC-BY-4.0, attribution), HKAllen corpus (CC-BY-4.0, attribution), raptorkwok-base (CC0), HKCanCor (CC BY), Qwen3.5 (Apache-2.0), onnxruntime / llama.rn / react-native-executorch (MIT).
- **Provenance risk:** datasets that re-mix machine translations or NC data under a permissive label (e.g. `indiejoseph/yue-zh-translation` includes botisan's NC-SA data). Prefer HKAllen + raptorkwok-base for anything you ship.
- **OpenAI:** the user's key means the user's account and terms. Disclose that text is sent to OpenAI.

---

## Appendix A: how the smoke test was run

- Scratch environment under `/tmp/cantotr` (nothing in the repo): uv venv with `opencc`, `ToJyutping`, `sacrebleu`, `torch`, `transformers`. llama.cpp release `b11985` macOS arm64 (`llama-server`). Qwen3.5 GGUFs from ModelScope `unsloth/Qwen3.5-*-GGUF`. NLLB weights from ModelScope `facebook/nllb-200-distilled-600M`.
- LLM prompt: a Cantonese system prompt ("你係一個香港粵語翻譯員…只輸出譯文") + 2 few-shot pairs, temperature 0.2, thinking disabled.
- NLLB: `src_lang=zho_Hans` (or `zho_Hant` for traditional input), `forced_bos_token_id=yue_Hant`, beam 4.
- Scoring: `sacrebleu.metrics.CHRF(word_order=0)` corpus score after stripping punctuation and whitespace.

Core rule table excerpt (the regex rules that mattered):

```python
re.sub(rf"(\w{{1,3}})比(\w{{1,3}}?)([{ADJ}])", r"\1\3過\2", s)      # 我比你高 -> 我高過你
re.sub(r"先(\w)(啦|吧|。|，|$)", r"\1先\2", s)                        # 你先行啦 -> 你行先啦
re.sub(r"畀我(一?[杯碗個張本件啲])(\w{1,2})", r"畀\1\2我", s)         # 畀我一杯水 -> 畀一杯水我
re.sub(r"喺(睇|食|飲|講|玩|做|瞓)", r"喺度\1緊", s)                    # 喺睇電視 -> 喺度睇緊電視
```

Test sentences (Set A, 16) included: 你吃饭了吗？ / 他不在家，他去上班了。 / 我没有钱，你可以借给我一点吗？ / 这个东西多少钱？ / 你先走吧，我等一下再来。 / 我比你高。 / 给我一杯水。 / 他们在看电视。 / 你知道他是谁吗？ / … Held-out Set B (12): 我明天要去医院看医生。 / 你会不会说广东话？ / 他昨天买了一辆新车。 / 那边的人很多，我们走这边吧。 / 我已经吃饱了，谢谢。 / 她的妈妈是老师。 / 你为什么不告诉我？ / 别担心，没问题的。 / 我们一起去喝茶吧。 / 这里不可以抽烟。 / 他跑得比我快。 / 你住在哪里？

## Appendix B: key links

- to-jyutping: <https://github.com/CanCLID/to-jyutping> · G2P benchmark: <https://github.com/hon9kon9ize/yue-g2p-benchmark>
- Parallel data: <https://huggingface.co/datasets/HKAllen/cantonese-chinese-parallel-corpus> · <https://huggingface.co/datasets/raptorkwok/cantonese-chinese-parallel-corpus-base> · <https://huggingface.co/datasets/raptorkwok/cantonese-chinese-parallel-corpus>
- Models: <https://huggingface.co/hon9kon9ize/bart-translation-zh-yue-onnx> · <https://huggingface.co/facebook/nllb-200-distilled-600M> · <https://huggingface.co/Qwen/Qwen3.5-0.8B> · <https://huggingface.co/hon9kon9ize/ERNIE-4.5-0.3B-Yue>
- Runtimes: <https://github.com/mybigday/llama.rn> · <https://github.com/software-mansion/react-native-executorch> · <https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html>
- OpenAI: <https://developers.openai.com/api/docs/pricing> · <https://developers.openai.com/api/docs/models/gpt-6-luna> · <https://developers.openai.com/api/docs/guides/structured-outputs>
- Key storage: <https://docs.expo.dev/versions/latest/sdk/securestore/>
- Papers: arXiv 2505.17816 (zh→yue NMT, beats Baidu on 6/8 sets) · 2301.03971 (unsupervised zh↔yue) · 2408.16756 (Yue-Benchmark incl. Yue-TRANS) · 2511.10664 (LLMs on Cantonese colloquialisms) · 2503.03702 (2B-token Cantonese corpus)
