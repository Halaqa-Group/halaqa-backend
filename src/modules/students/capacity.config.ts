export const CAPACITY_LIMITS = {
  hifz: { min: 0, max: 20 },
  near: { min: 0, max: 50 },
  far: { min: 0, max: 100 },
} as const;

/**
 * وحدة القدرة اليومية — the unit the stored capacity number is counted in.
 * The columns keep their `daily_*_pages_capacity` names for backwards
 * compatibility, so the number is only pages when its unit is `page`.
 * `quarter` is ربع الحزب (an eighth of a juz), not a quarter of a juz.
 *
 * The numeric bounds in CAPACITY_LIMITS are unit-agnostic — they cap the raw
 * number whatever it counts.
 */
export const CAPACITY_UNITS = [
  'page',
  'juz',
  'hizb',
  'quarter',
  'surah',
] as const;

export type StudentCapacityUnit = (typeof CAPACITY_UNITS)[number];

export const DEFAULT_CAPACITY_UNIT: StudentCapacityUnit = 'page';
