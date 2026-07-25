import { roundHalfUp } from './rounding';

describe('roundHalfUp', () => {
  it('rounds exact halves up (2 decimals)', () => {
    expect(roundHalfUp(0.125)).toBe(0.13);
    expect(roundHalfUp(2.675)).toBe(2.68);
    expect(roundHalfUp(27.345)).toBe(27.35);
    expect(roundHalfUp(91.105)).toBe(91.11);
  });

  it('leaves values below the half unchanged', () => {
    expect(roundHalfUp(1.2349)).toBe(1.23);
    expect(roundHalfUp(99.994)).toBe(99.99);
  });

  it('respects the decimals argument', () => {
    expect(roundHalfUp(1.23456, 4)).toBe(1.2346);
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(0.5, 0)).toBe(1);
  });

  it('is a no-op on whole numbers and passes through non-finite', () => {
    expect(roundHalfUp(100)).toBe(100);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(Number.NaN)).toBeNaN();
    expect(roundHalfUp(Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
