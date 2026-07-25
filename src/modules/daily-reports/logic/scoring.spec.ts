import {
  computeStudentScores,
  ethicsScore,
  overallPlanCompletionRate,
  trackScore,
  type StudentScoreInput,
} from './scoring';

describe('score primitives', () => {
  it('trackScore (§16 example) = 30 × 0.75 × 0.90 = 20.25', () => {
    expect(
      trackScore({ effectiveWeight: 30, completionRate: 75, qualityRate: 90 }),
    ).toBeCloseTo(20.25, 9);
  });

  it('ethicsScore (§18 example) = 5 × 4 ÷ 5 = 4', () => {
    expect(ethicsScore(5, 4)).toBeCloseTo(4, 9);
    expect(ethicsScore(5, 5)).toBeCloseTo(5, 9);
  });

  it('overallPlanCompletionRate (§17 example) = 78.95%', () => {
    const rate = overallPlanCompletionRate(
      [
        { effectiveWeight: 40, completionRate: 100, qualityRate: 0 },
        { effectiveWeight: 25, completionRate: 80, qualityRate: 0 },
        { effectiveWeight: 30, completionRate: 50, qualityRate: 0 },
      ],
      95,
    );
    expect(rate).toBeCloseTo(78.9473, 3);
  });

  it('plan completion is independent of quality', () => {
    const a = overallPlanCompletionRate(
      [{ effectiveWeight: 95, completionRate: 60, qualityRate: 10 }],
      95,
    );
    const b = overallPlanCompletionRate(
      [{ effectiveWeight: 95, completionRate: 60, qualityRate: 99 }],
      95,
    );
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('computeStudentScores — attendance rules (§20)', () => {
  const present = (
    over: Partial<StudentScoreInput> = {},
  ): StudentScoreInput => ({
    attendance: 'present',
    academicWeight: 95,
    ethicsWeight: 5,
    ethicsRating: 5,
    hifz: { effectiveWeight: 40, completionRate: 100, qualityRate: 100 },
    near: { effectiveWeight: 25, completionRate: 100, qualityRate: 100 },
    far: { effectiveWeight: 30, completionRate: 100, qualityRate: 100 },
    ...over,
  });

  it('present with everything perfect → total capped at 100', () => {
    const s = computeStudentScores(present());
    expect(s.totalScore).toBeCloseTo(100, 9);
    expect(s.ethicsScore).toBeCloseTo(5, 9);
  });

  it('late is scored exactly like present (no automatic penalty)', () => {
    const p = computeStudentScores(present());
    const l = computeStudentScores(present({ attendance: 'late' }));
    expect(l).toEqual(p);
  });

  it('test 4 — partial: eff 30, completion 75, quality 90 → score 20.25', () => {
    const s = computeStudentScores({
      attendance: 'present',
      academicWeight: 95,
      ethicsWeight: 5,
      ethicsRating: 0,
      hifz: { effectiveWeight: 0, completionRate: 0, qualityRate: 0 },
      near: { effectiveWeight: 0, completionRate: 0, qualityRate: 0 },
      far: { effectiveWeight: 30, completionRate: 75, qualityRate: 90 },
    });
    expect(s.farScore).toBeCloseTo(20.25, 9);
  });

  it('absent → all zeros', () => {
    const s = computeStudentScores(present({ attendance: 'absent' }));
    expect(s).toEqual({
      hifzScore: 0,
      nearScore: 0,
      farScore: 0,
      ethicsScore: 0,
      overallPlanCompletionRate: 0,
      totalScore: 0,
    });
  });

  it('excused → all zeros (same as absent)', () => {
    const s = computeStudentScores(present({ attendance: 'excused' }));
    expect(s.totalScore).toBe(0);
    expect(s.ethicsScore).toBe(0);
  });

  it('missing_attendance → total/ethics/overall NULL, tracks still numeric', () => {
    const s = computeStudentScores(
      present({ attendance: 'missing_attendance' }),
    );
    expect(s.totalScore).toBeNull();
    expect(s.ethicsScore).toBeNull();
    expect(s.overallPlanCompletionRate).toBeNull();
    expect(typeof s.hifzScore).toBe('number');
  });
});
