import type { TrackType } from '../../achievements/entities/achievement.entity';
import { redistributeWeights } from './weight-redistribution';

const BASE = { hifz: 40, near: 25, far: 30, ethics: 5 };
const tracks = (...t: TrackType[]) => new Set<TrackType>(t);

describe('redistributeWeights (§6.2 examples)', () => {
  it('all tracks present → base weights unchanged', () => {
    const w = redistributeWeights(BASE, tracks('Hifz', 'Near', 'Far'));
    expect(w).toMatchObject({ hifz: 40, near: 25, far: 30, ethics: 5 });
    expect(w.academicWeight).toBe(95);
  });

  it('single track takes the whole academic weight', () => {
    expect(redistributeWeights(BASE, tracks('Near')).near).toBeCloseTo(95, 9);
    expect(redistributeWeights(BASE, tracks('Hifz')).hifz).toBeCloseTo(95, 9);
    expect(redistributeWeights(BASE, tracks('Far')).far).toBeCloseTo(95, 9);
  });

  it('no hifz → its weight is split over the planned reviews by base ratio', () => {
    const w = redistributeWeights(BASE, tracks('Near', 'Far'));
    expect(w.hifz).toBe(0);
    expect(w.near).toBeCloseTo((25 / 55) * 95, 9); // 43.18
    expect(w.far).toBeCloseTo((30 / 55) * 95, 9); // 51.82
  });

  it('no far → its weight goes to near only, hifz untouched', () => {
    const w = redistributeWeights(BASE, tracks('Hifz', 'Near'));
    expect(w.hifz).toBeCloseTo(40, 9);
    expect(w.near).toBeCloseTo(55, 9);
    expect(w.far).toBe(0);
  });

  it('no near → its weight goes to far only, hifz untouched', () => {
    const w = redistributeWeights(BASE, tracks('Hifz', 'Far'));
    expect(w.hifz).toBeCloseTo(40, 9);
    expect(w.near).toBe(0);
    expect(w.far).toBeCloseTo(55, 9);
  });

  it('neither review planned → the whole review pool falls back to hifz', () => {
    const w = redistributeWeights(BASE, tracks('Hifz'));
    expect(w.hifz).toBeCloseTo(95, 9);
    expect(w.near).toBe(0);
    expect(w.far).toBe(0);
  });

  it('one review only → review pool plus hifz weight land on it', () => {
    const near = redistributeWeights(BASE, tracks('Near'));
    expect(near.near).toBeCloseTo(95, 9);
    expect(near.hifz).toBe(0);
    const far = redistributeWeights(BASE, tracks('Far'));
    expect(far.far).toBeCloseTo(95, 9);
    expect(far.hifz).toBe(0);
  });

  it('splits equally when the planned reviews both have base weight 0', () => {
    const w = redistributeWeights(
      { hifz: 95, near: 0, far: 0, ethics: 5 },
      tracks('Near', 'Far'),
    );
    expect(w.near).toBeCloseTo(47.5, 9);
    expect(w.far).toBeCloseTo(47.5, 9);
  });

  it('effective academic weights always total the academic weight', () => {
    for (const set of [
      tracks('Hifz', 'Near', 'Far'),
      tracks('Near', 'Far'),
      tracks('Hifz', 'Near'),
      tracks('Hifz', 'Far'),
      tracks('Hifz'),
      tracks('Near'),
      tracks('Far'),
    ]) {
      const w = redistributeWeights(BASE, set);
      expect(w.hifz + w.near + w.far).toBeCloseTo(95, 9);
    }
  });

  it('no academic plan → all academic weights 0, ethics preserved (§6.3)', () => {
    const w = redistributeWeights(BASE, tracks());
    expect(w).toMatchObject({ hifz: 0, near: 0, far: 0, ethics: 5 });
    expect(w.academicWeight).toBe(95);
  });

  it('honors a different ethics weight', () => {
    const w = redistributeWeights(
      { hifz: 50, near: 20, far: 20, ethics: 10 },
      tracks('Hifz', 'Near', 'Far'),
    );
    expect(w.academicWeight).toBe(90);
    expect(w.hifz + w.near + w.far).toBeCloseTo(90, 9);
  });
});
