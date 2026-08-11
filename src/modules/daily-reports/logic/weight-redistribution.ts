import type { TrackType } from '../../achievements/entities/achievement.entity';

/** The four base track weights configured on the halaqa; the four sum to 100. */
export interface BaseTrackWeights {
  hifz: number;
  near: number;
  far: number;
  ethics: number;
}

export interface EffectiveTrackWeights {
  /** Effective academic weights — 0 for a track not present in the day's plan. */
  hifz: number;
  near: number;
  far: number;
  ethics: number;
  /** academic_weight = 100 - ethics_weight (§6.1). */
  academicWeight: number;
}

type AcademicTrack = 'Hifz' | 'Near' | 'Far';

const REVIEW_TRACKS: AcademicTrack[] = ['Near', 'Far'];

/**
 * Redistributes the academic weight across the tracks actually present in the
 * day's approved plan (§6). Presence is decided by the plan, not by achievement.
 * Ethics is independent and never redistributed.
 *
 * Redistribution is **family-first**: review weight stays with review, and only
 * falls back to Hifz when neither review track is planned.
 *
 *  - Near planned, Far not  → Far's weight goes to Near (and vice versa).
 *  - Neither review planned → both review weights go to Hifz.
 *  - Hifz not planned       → Hifz's weight is split over the planned review
 *                             tracks in proportion to their base weights.
 *  - No academic track planned → all academic effective weights are 0 (§6.3).
 *
 * The result is finally scaled so the three effective weights total
 * `academic_weight`, which also absorbs any drift if the stored base weights
 * don't sum to exactly 100.
 */
export function redistributeWeights(
  base: BaseTrackWeights,
  plannedTracks: ReadonlySet<TrackType>,
): EffectiveTrackWeights {
  const academicWeight = 100 - base.ethics;
  const baseByTrack: Record<AcademicTrack, number> = {
    Hifz: base.hifz,
    Near: base.near,
    Far: base.far,
  };

  // Every planned track keeps its own weight; only the unplanned tracks' weights
  // form the pools that get handed out below.
  const eff: Record<AcademicTrack, number> = { Hifz: 0, Near: 0, Far: 0 };
  for (const t of ['Hifz', ...REVIEW_TRACKS] as AcademicTrack[]) {
    if (plannedTracks.has(t)) eff[t] = baseByTrack[t];
  }

  const plannedReviews = REVIEW_TRACKS.filter((t) => plannedTracks.has(t));
  const droppedReviewPool = REVIEW_TRACKS.filter(
    (t) => !plannedTracks.has(t),
  ).reduce((sum, t) => sum + baseByTrack[t], 0);

  /** Split `pool` over `targets` by base share; equal shares when all bases are 0. */
  const spread = (pool: number, targets: AcademicTrack[]) => {
    if (!targets.length || pool <= 0) return;
    const baseSum = targets.reduce((sum, t) => sum + baseByTrack[t], 0);
    for (const t of targets) {
      eff[t] +=
        baseSum > 0 ? (baseByTrack[t] / baseSum) * pool : pool / targets.length;
    }
  };

  if (plannedReviews.length) {
    // Review weight never leaves the review family while one of them is planned.
    spread(droppedReviewPool, plannedReviews);
    if (!plannedTracks.has('Hifz')) spread(base.hifz, plannedReviews);
  } else {
    // No review at all → the whole review pool falls back to Hifz (0 if unplanned
    // too, which is the "no academic plan" case of §6.3).
    eff.Hifz += plannedTracks.has('Hifz') ? droppedReviewPool : 0;
  }

  const total = eff.Hifz + eff.Near + eff.Far;
  const scale = total > 0 ? academicWeight / total : 0;

  return {
    hifz: eff.Hifz * scale,
    near: eff.Near * scale,
    far: eff.Far * scale,
    ethics: base.ethics,
    academicWeight,
  };
}
