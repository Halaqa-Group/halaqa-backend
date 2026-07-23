import type { TrackType } from '../../achievements/entities/achievement.entity';

/**
 * Shapes of the JSON payloads stored on daily-report rows. Kept in one place so
 * the entities, the reconciliation service (Phase 2), and the API mappers agree.
 * Mirrors §12 (per-track reconciliation) and §23 (system alerts) of the spec.
 */

export type AlertSeverity = 'info' | 'warning' | 'error';

/** One entry in `daily_student_evaluations.system_alerts` (§23). */
export interface SystemAlert {
  code: string;
  severity: AlertSeverity;
  message: string;
}

/** A planned/achieved/gap verse range with its fractional page coverage. */
export interface VerseSegment {
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
  startGlobalAyah: number;
  endGlobalAyah: number;
  pageCoverage: number;
}

export interface PlannedRange extends VerseSegment {
  planItemId: number;
}

/** An atomic reconciled segment that credited a chosen achievement (§12). */
export interface ApprovedSegment extends VerseSegment {
  percentageScore: number;
  selectedAchievementId: number;
  candidateAchievementIds: number[];
}

/** A portion of an achievement that fell outside the plan (§12). */
export interface OutsidePlanSegment {
  achievementId: number;
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
  pageCoverage: number;
}

/** Full per-track reconciliation payload — `*_reconciliation` columns (§12). */
export interface TrackReconciliation {
  version: number;
  trackType: TrackType;
  plannedPages: number;
  achievedPages: number;
  completionRate: number;
  qualityRate: number;
  plannedRanges: PlannedRange[];
  approvedSegments: ApprovedSegment[];
  gaps: VerseSegment[];
  outsidePlanSegments: OutsidePlanSegment[];
}

/**
 * `daily_student_evaluations.calculation_details` — the audit trail of how the
 * row's numbers were derived (weights used, redistribution, per-track summary,
 * plan-completion breakdown). Its full shape is finalized with the scoring
 * module (Phase 2); typed loosely here so the schema is not over-committed.
 */
export type CalculationDetails = Record<string, unknown>;
