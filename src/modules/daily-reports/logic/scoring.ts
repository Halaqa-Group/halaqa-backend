import type { EvaluationAttendanceStatus } from '../entities/daily-student-evaluation.entity';

/**
 * Final score math for one student/day (§16–§20). Pure and full-precision — the
 * caller rounds for storage/display (§27). `percentage_score` from achievements
 * is consumed as-is (§15.1); this module never re-derives recitation quality.
 */

/** Per-track figures produced by reconciliation (rates are 0..100). */
export interface TrackScoreInput {
  effectiveWeight: number;
  completionRate: number;
  qualityRate: number;
}

/** track_score = effective_weight × completion/100 × quality/100 (§16). */
export function trackScore(t: TrackScoreInput): number {
  return t.effectiveWeight * (t.completionRate / 100) * (t.qualityRate / 100);
}

/** ethics_score = ethics_weight × ethics_rating ÷ 5 (§18). */
export function ethicsScore(
  ethicsWeight: number,
  ethicsRating: number,
): number {
  return (ethicsWeight * ethicsRating) / 5;
}

/**
 * overall_plan_completion_rate = Σ(effective × completion) ÷ academic_weight (§17).
 * Independent of recitation quality and ethics. 0 when no academic weight/plan.
 */
export function overallPlanCompletionRate(
  tracks: TrackScoreInput[],
  academicWeight: number,
): number {
  if (academicWeight <= 0) return 0;
  const weighted = tracks.reduce(
    (sum, t) => sum + t.effectiveWeight * t.completionRate,
    0,
  );
  return weighted / academicWeight;
}

export interface StudentScoreInput {
  attendance: EvaluationAttendanceStatus;
  academicWeight: number;
  ethicsWeight: number;
  ethicsRating: number | null;
  hifz: TrackScoreInput;
  near: TrackScoreInput;
  far: TrackScoreInput;
}

export interface StudentScores {
  hifzScore: number;
  nearScore: number;
  farScore: number;
  ethicsScore: number | null;
  overallPlanCompletionRate: number | null;
  totalScore: number | null;
}

const TOTAL_SCORE_CAP = 100;

/**
 * Applies the attendance rules of §20 on top of the score math:
 *  - present / late  → computed normally (late has no automatic penalty).
 *  - absent / excused → everything 0, no achievement counted.
 *  - missing_attendance → total_score NULL (excluded from averages); the NOT NULL
 *    per-track columns are 0 and ethics/overall are NULL.
 */
export function computeStudentScores(input: StudentScoreInput): StudentScores {
  if (input.attendance === 'absent' || input.attendance === 'excused') {
    return {
      hifzScore: 0,
      nearScore: 0,
      farScore: 0,
      ethicsScore: 0,
      overallPlanCompletionRate: 0,
      totalScore: 0,
    };
  }

  const hifzScore = trackScore(input.hifz);
  const nearScore = trackScore(input.near);
  const farScore = trackScore(input.far);
  const overall = overallPlanCompletionRate(
    [input.hifz, input.near, input.far],
    input.academicWeight,
  );

  if (input.attendance === 'missing_attendance') {
    return {
      hifzScore,
      nearScore,
      farScore,
      ethicsScore: null,
      overallPlanCompletionRate: null,
      totalScore: null,
    };
  }

  // present / late
  const ethics =
    input.ethicsRating != null
      ? ethicsScore(input.ethicsWeight, input.ethicsRating)
      : 0;
  const total = Math.min(
    hifzScore + nearScore + farScore + ethics,
    TOTAL_SCORE_CAP,
  );
  return {
    hifzScore,
    nearScore,
    farScore,
    ethicsScore: ethics,
    overallPlanCompletionRate: overall,
    totalScore: total,
  };
}
