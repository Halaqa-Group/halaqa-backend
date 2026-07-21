# Score formula — worked examples

> **The backend does not compute this.** `percentage_score` arrives on the request, already
> computed by the frontend, and is stored as-is (rounded to 2dp). There is no
> `AchievementScoreService`. This file documents the weights the backend serves and the
> convention the frontend applies to them — it is not a description of backend behaviour.

## What the backend owns: the weights

`evaluation_settings` is JSON on the `halaqat` row. It holds exactly four weights — the score
**deducted per single error** of each type:

```json
{
  "mistake_weight": 4,
  "warning_weight": 2,
  "tajweed_weight": 1,
  "harakat_weight": 2
}
```

Those values are also the defaults. The column is nullable and every key optional; reads run
through `resolveEvaluationSettings()`, which merges stored values over the defaults, so a halaqa
response **always carries all four weights**. Unknown keys are rejected (400) — the shape is closed.

There is no stored `base_score` or `min_score`. The 100-point base and the 0 floor below are
frontend conventions, not configuration.

## The convention the frontend applies

```
score = max(0,
            100
              - mistakes_count       * mistake_weight
              - warnings_count       * warning_weight
              - tajweed_errors_count * tajweed_weight
              - harakat_errors_count * harakat_weight)

then round to 2 decimal places.
```

The counts fed in are the achievement's **totals** — the roll-up of its recitation positions.

## Examples, at the default weights

| mistakes | warnings | tajweed | harakat | score |
|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 | 100.00 |
| 1 | 0 | 0 | 0 | 100 - 4 = **96.00** |
| 0 | 1 | 0 | 0 | 100 - 2 = **98.00** |
| 0 | 0 | 1 | 0 | 100 - 1 = **99.00** |
| 0 | 0 | 0 | 1 | 100 - 2 = **98.00** |
| 2 | 3 | 1 | 2 | 100 - 8 - 6 - 1 - 4 = **81.00** |
| 5 | 5 | 5 | 5 | 100 - 20 - 10 - 5 - 10 = **55.00** |
| 30 | 20 | 10 | 10 | 100 - 120 - 40 - 10 - 20 = -90 → **clamped to 0** |

## A more lenient halaqa

A halaqa for younger students might set:

```json
{
  "mistake_weight": 1,
  "warning_weight": 0.5,
  "tajweed_weight": 0.5,
  "harakat_weight": 0.5
}
```

| mistakes | warnings | tajweed | harakat | score |
|---:|---:|---:|---:|---:|
| 5 | 5 | 5 | 5 | 100 - 5 - 2.5 - 2.5 - 2.5 = **87.50** |
| 20 | 10 | 10 | 10 | 100 - 20 - 5 - 5 - 5 = **65.00** |

## A stricter halaqa

```json
{
  "mistake_weight": 8,
  "warning_weight": 4,
  "tajweed_weight": 3,
  "harakat_weight": 4
}
```

| mistakes | warnings | tajweed | harakat | score |
|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 0 | **92.00** |
| 2 | 1 | 1 | 1 | 100 - 16 - 4 - 3 - 4 = **73.00** |
| 5 | 5 | 5 | 5 | 100 - 40 - 20 - 15 - 20 = **5.00** |

## Partial weights fall back per-key

A halaqa storing only `{"mistake_weight": 8}` resolves to
`{mistake_weight: 8, warning_weight: 2, tajweed_weight: 1, harakat_weight: 2}` — the fallback is
per-key, not all-or-nothing.

## The score is not validated against the counts

The backend stores whatever `percentage_score` the client sends, clamped only by the DTO's
`@Min(0) @Max(100)`. It never checks that the value agrees with the counts and the weights. A
client sending mismatched values produces an achievement whose score doesn't follow the formula,
and nothing rejects it. If that ever needs enforcing, it belongs in `AchievementsService.create`
/ `update`, and it needs the weights loaded from the halaqa.

## Historical scores are frozen

When a halaqa's `evaluation_settings` changes, **existing achievements are not recomputed.** Their
stored `percentage_score` reflects the weights in effect when the frontend computed it.

This is intentional. Schools that update their grading weights mid-year shouldn't have past grades
silently shift. The halaqa activity log captures every `evaluation_settings` change, so the weight
history is recoverable if needed.

If a principal genuinely wants to recompute historical scores, that's a future admin endpoint, not
part of the routine update flow.
