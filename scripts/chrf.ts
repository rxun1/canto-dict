// chrF (Popović 2015) as sacreBLEU 2.x computes it by default: character n-grams of orders 1–6
// with whitespace removed, precision and recall averaged over the orders where both sides have
// n-grams ("effective order"), then F-beta with β = 2. A corpus score sums the counts of all pairs
// first (sacrebleu/metrics/chrf.py _compute_f_score, _aggregate_and_compute).

const CHAR_ORDER = 6;
const BETA = 2;

/** Per order: hypothesis n-grams, reference n-grams, matches (each n-gram counted at most as often as the other side has it). */
type Stats = { hyp: number; ref: number; match: number }[];

function ngramCounts(chars: readonly string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= chars.length; i++) {
    const ngram = chars.slice(i, i + n).join("");
    counts.set(ngram, (counts.get(ngram) ?? 0) + 1);
  }
  return counts;
}

function pairStats(hypothesis: string, reference: string): Stats {
  // Code points, as Python slices strings.
  const hypChars = Array.from(hypothesis.replace(/\s/gu, ""));
  const refChars = Array.from(reference.replace(/\s/gu, ""));
  const stats: Stats = [];
  for (let n = 1; n <= CHAR_ORDER; n++) {
    const hypNgrams = ngramCounts(hypChars, n);
    const refNgrams = ngramCounts(refChars, n);
    let hyp = 0;
    let match = 0;
    for (const [ngram, count] of hypNgrams) {
      hyp += count;
      match += Math.min(count, refNgrams.get(ngram) ?? 0);
    }
    let ref = 0;
    for (const count of refNgrams.values()) ref += count;
    // sacreBLEU doesn't count hypothesis n-grams of an order the reference has none of.
    stats.push({ hyp: ref > 0 ? hyp : 0, ref, match });
  }
  return stats;
}

function score(stats: Stats): number {
  let precision = 0;
  let recall = 0;
  let effectiveOrder = 0;
  for (const { hyp, ref, match } of stats) {
    if (hyp === 0 || ref === 0) continue;
    precision += match / hyp;
    recall += match / ref;
    effectiveOrder++;
  }
  if (effectiveOrder === 0) return 0;
  precision /= effectiveOrder;
  recall /= effectiveOrder;
  if (precision + recall === 0) return 0;
  const factor = BETA ** 2;
  return (100 * (1 + factor) * precision * recall) / (factor * precision + recall);
}

/** chrF of one hypothesis against one reference, 0–100. */
export function chrf(hypothesis: string, reference: string): number {
  return score(pairStats(hypothesis, reference));
}

/** chrF of a whole test set of [hypothesis, reference] pairs, 0–100. */
export function corpusChrf(pairs: readonly (readonly [string, string])[]): number {
  const total: Stats = Array.from({ length: CHAR_ORDER }, () => ({ hyp: 0, ref: 0, match: 0 }));
  for (const [hypothesis, reference] of pairs) {
    pairStats(hypothesis, reference).forEach(({ hyp, ref, match }, i) => {
      total[i].hyp += hyp;
      total[i].ref += ref;
      total[i].match += match;
    });
  }
  return score(total);
}
