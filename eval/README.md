# Translation eval set

`test-set.tsv` holds 200 Mandarin → Cantonese sentence pairs for scoring the offline translator
with chrF (`npm run eval:translate`). Columns: `source` (dataset), `row` (split:row index in that
dataset), `zh` (Mandarin), `yue` (Cantonese reference).

Built by `npm run eval:build-set` (`scripts/build-eval-set.ts`): 100 pairs from each dataset below,
sampled with a fixed seed, keeping sentences of 4–60 characters whose two sides differ and whose
Mandarin side has no Cantonese-only character. raptorkwok-base's Mandarin side is still noisier
than HKAllen's (some rows are loose paraphrases).

## Sources

- **HKAllen/cantonese-chinese-parallel-corpus** — <https://huggingface.co/datasets/HKAllen/cantonese-chinese-parallel-corpus>,
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Mandarin in simplified
  characters. Sentences used unchanged.
- **raptorkwok/cantonese-chinese-parallel-corpus-base** — <https://huggingface.co/datasets/raptorkwok/cantonese-chinese-parallel-corpus-base>,
  licensed [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Test split. Mandarin in
  traditional characters. Sentences used unchanged.
