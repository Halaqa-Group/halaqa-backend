import { Injectable } from '@nestjs/common';

export interface RawCounts {
  mistakesCount: number;
  warningsCount: number;
  tajweedErrorsCount: number;
}

export interface EvaluationSettings {
  base_score: number;
  mistake_weight: number;
  warning_weight: number;
  tajweed_weight: number;
  min_score: number;
}

@Injectable()
export class AchievementScoreService {
  compute(counts: RawCounts, settings: EvaluationSettings): number {
    const raw =
      settings.base_score -
      counts.mistakesCount * settings.mistake_weight -
      counts.warningsCount * settings.warning_weight -
      counts.tajweedErrorsCount * settings.tajweed_weight;

    const floored = Math.max(settings.min_score, raw);
    return Math.round(floored * 100) / 100;
  }
}
