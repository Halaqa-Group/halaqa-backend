import { AchievementScoreService, EvaluationSettings, RawCounts } from './achievement-score.service';

const DEFAULT_SETTINGS: EvaluationSettings = {
  base_score: 100,
  mistake_weight: 2.0,
  warning_weight: 1.0,
  tajweed_weight: 1.5,
  min_score: 0,
};

describe('AchievementScoreService', () => {
  let service: AchievementScoreService;

  beforeEach(() => {
    service = new AchievementScoreService();
  });

  describe('compute()', () => {
    it('returns base_score when all counts are zero', () => {
      const counts: RawCounts = { mistakesCount: 0, warningsCount: 0, tajweedErrorsCount: 0 };
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(100);
    });

    it('deducts mistake_weight per mistake', () => {
      const counts: RawCounts = { mistakesCount: 5, warningsCount: 0, tajweedErrorsCount: 0 };
      // 100 - 5*2 = 90
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(90);
    });

    it('deducts warning_weight per warning', () => {
      const counts: RawCounts = { mistakesCount: 0, warningsCount: 3, tajweedErrorsCount: 0 };
      // 100 - 3*1 = 97
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(97);
    });

    it('deducts tajweed_weight per tajweed error', () => {
      const counts: RawCounts = { mistakesCount: 0, warningsCount: 0, tajweedErrorsCount: 4 };
      // 100 - 4*1.5 = 94
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(94);
    });

    it('deducts all error types combined', () => {
      const counts: RawCounts = { mistakesCount: 2, warningsCount: 3, tajweedErrorsCount: 2 };
      // 100 - 2*2 - 3*1 - 2*1.5 = 100 - 4 - 3 - 3 = 90
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(90);
    });

    it('floors at min_score when deductions exceed base_score', () => {
      const counts: RawCounts = { mistakesCount: 100, warningsCount: 0, tajweedErrorsCount: 0 };
      // 100 - 100*2 = -100 → floored to 0
      expect(service.compute(counts, DEFAULT_SETTINGS)).toBe(0);
    });

    it('respects a non-zero min_score', () => {
      const settings: EvaluationSettings = { ...DEFAULT_SETTINGS, min_score: 10 };
      const counts: RawCounts = { mistakesCount: 100, warningsCount: 0, tajweedErrorsCount: 0 };
      expect(service.compute(counts, settings)).toBe(10);
    });

    it('rounds to 2 decimal places', () => {
      const settings: EvaluationSettings = { ...DEFAULT_SETTINGS, tajweed_weight: 1.3 };
      const counts: RawCounts = { mistakesCount: 0, warningsCount: 0, tajweedErrorsCount: 1 };
      // 100 - 1.3 = 98.7 → 98.7
      expect(service.compute(counts, settings)).toBe(98.7);
    });

    it('handles fractional deductions that need rounding', () => {
      const settings: EvaluationSettings = { ...DEFAULT_SETTINGS, tajweed_weight: 1.3 };
      const counts: RawCounts = { mistakesCount: 0, warningsCount: 0, tajweedErrorsCount: 3 };
      // 100 - 3*1.3 = 100 - 3.9 = 96.1
      expect(service.compute(counts, settings)).toBe(96.1);
    });

    it('uses custom base_score', () => {
      const settings: EvaluationSettings = { ...DEFAULT_SETTINGS, base_score: 50 };
      const counts: RawCounts = { mistakesCount: 5, warningsCount: 0, tajweedErrorsCount: 0 };
      // 50 - 5*2 = 40
      expect(service.compute(counts, settings)).toBe(40);
    });
  });
});
