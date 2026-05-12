# Score formula — worked examples

The formula:

```
score = max(min_score,
            base_score
              - mistakes_count    * mistake_weight
              - warnings_count    * warning_weight
              - tajweed_errors_count * tajweed_weight)

then round to 2 decimal places.
```

`evaluation_settings` is JSON on the `halaqat` row. Mandatory; the achievements module assumes presence.

## Default settings

```json
{
  "base_score": 100,
  "mistake_weight": 2.0,
  "warning_weight": 1.0,
  "tajweed_weight": 1.5,
  "min_score": 0
}
```

## Examples

| mistakes | warnings | tajweed | score |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 100.00 |
| 1 | 0 | 0 | 98.00  |
| 0 | 1 | 0 | 99.00  |
| 0 | 0 | 1 | 98.50  |
| 2 | 3 | 1 | 100 - 4 - 3 - 1.5 = **91.50** |
| 5 | 5 | 5 | 100 - 10 - 5 - 7.5 = **77.50** |
| 30 | 20 | 10 | 100 - 60 - 20 - 15 = -25 → **clamped to 0** |

## A more lenient halaqa

A halaqa for younger students might set:

```json
{
  "base_score": 100,
  "mistake_weight": 1.0,
  "warning_weight": 0.5,
  "tajweed_weight": 0.5,
  "min_score": 50
}
```

| mistakes | warnings | tajweed | score |
|---:|---:|---:|---:|
| 5 | 5 | 5 | 100 - 5 - 2.5 - 2.5 = 90 |
| 20 | 10 | 10 | 100 - 20 - 5 - 5 = 70 |
| 100 | 0 | 0 | 100 - 100 = 0 → **clamped to 50** |

## A stricter halaqa

```json
{
  "base_score": 100,
  "mistake_weight": 5.0,
  "warning_weight": 3.0,
  "tajweed_weight": 4.0,
  "min_score": 0
}
```

| mistakes | warnings | tajweed | score |
|---:|---:|---:|---:|
| 1 | 0 | 0 | 95 |
| 2 | 1 | 1 | 100 - 10 - 3 - 4 = 83 |
| 5 | 5 | 5 | 100 - 25 - 15 - 20 = **40** |

## Rounding

Use half-up rounding to 2 decimal places. JavaScript's `Math.round(score * 100) / 100` does half-to-even for some values; if that matters, use a dedicated rounding helper. For typical inputs (integer counts, decimal weights with one decimal place), the difference is negligible.

## Historical scores are frozen

When a halaqa's `evaluation_settings` changes, **existing achievements are not recomputed.** Their stored `percentage_score` reflects the formula in effect at the time of computation.

This is intentional. Schools that update their grading formula in mid-year shouldn't have past grades silently shift. The audit log captures every `evaluation_settings` change on the halaqa, so the formula history is recoverable if needed.

If a principal genuinely wants to recompute historical scores, that's a future admin endpoint, not part of the routine update flow.

## Where the computation runs

`AchievementScoreService.compute(rawCounts, evaluationSettings) → number`

Called from:
- `AchievementsService.create` (always)
- `AchievementsService.update` (only when counts change in the patch)

Not called from anywhere else. Never recompute on read.
