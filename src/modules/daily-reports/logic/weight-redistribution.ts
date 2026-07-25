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

const ACADEMIC_TRACKS: TrackType[] = ['Hifz', 'Near', 'Far'];

/**
 * Redistributes the academic weight across the tracks actually present in the
 * day's approved plan (§6). Presence is decided by the plan, not by achievement.
 * Ethics is independent and never redistributed. When no academic track is
 * planned, all academic effective weights are 0 (§6.3) while ethics is untouched.
 *
 *   effective = base ÷ Σ(base of planned academic tracks) × academic_weight
 *   academic_weight = 100 - ethics_weight
 */
export function redistributeWeights(
  base: BaseTrackWeights,
  plannedTracks: ReadonlySet<TrackType>,
): EffectiveTrackWeights {
  const academicWeight = 100 - base.ethics;
  const baseByTrack: Record<TrackType, number> = {
    Hifz: base.hifz,
    Near: base.near,
    Far: base.far,
  };

  const plannedBaseSum = ACADEMIC_TRACKS.filter((t) =>
    plannedTracks.has(t),
  ).reduce((sum, t) => sum + baseByTrack[t], 0);

  const effective = { hifz: 0, near: 0, far: 0 };
  if (plannedBaseSum > 0) {
    if (plannedTracks.has('Hifz'))
      effective.hifz = (base.hifz / plannedBaseSum) * academicWeight;
    if (plannedTracks.has('Near'))
      effective.near = (base.near / plannedBaseSum) * academicWeight;
    if (plannedTracks.has('Far'))
      effective.far = (base.far / plannedBaseSum) * academicWeight;
  }

  return { ...effective, ethics: base.ethics, academicWeight };
}
