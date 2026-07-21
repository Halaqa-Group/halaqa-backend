import { BadRequestException } from '@nestjs/common';
import { SURAH_VERSES } from './quran.constants';
import { QuranRangeValidator, VerseRange } from './quran-range.validator';

describe('QuranRangeValidator', () => {
  let validator: QuranRangeValidator;

  beforeEach(() => {
    validator = new QuranRangeValidator();
  });

  // ─── validate() ───────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('accepts a valid same-surah range', () => {
      expect(() =>
        validator.validate({
          startSurah: 1,
          startVerse: 1,
          endSurah: 1,
          endVerse: 7,
        }),
      ).not.toThrow();
    });

    it('accepts a single verse', () => {
      expect(() =>
        validator.validate({
          startSurah: 2,
          startVerse: 5,
          endSurah: 2,
          endVerse: 5,
        }),
      ).not.toThrow();
    });

    it('accepts a valid cross-surah range', () => {
      expect(() =>
        validator.validate({
          startSurah: 1,
          startVerse: 1,
          endSurah: 2,
          endVerse: 10,
        }),
      ).not.toThrow();
    });

    it('accepts the last verse of the last surah', () => {
      expect(() =>
        validator.validate({
          startSurah: 114,
          startVerse: 6,
          endSurah: 114,
          endVerse: 6,
        }),
      ).not.toThrow();
    });

    it('rejects start_surah < 1', () => {
      expect(() =>
        validator.validate({
          startSurah: 0,
          startVerse: 1,
          endSurah: 1,
          endVerse: 1,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects start_surah > 114', () => {
      expect(() =>
        validator.validate({
          startSurah: 115,
          startVerse: 1,
          endSurah: 115,
          endVerse: 1,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects end_surah < start_surah', () => {
      expect(() =>
        validator.validate({
          startSurah: 5,
          startVerse: 1,
          endSurah: 4,
          endVerse: 1,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects start_verse > total verses in surah', () => {
      // Al-Fatihah has 7 verses
      expect(() =>
        validator.validate({
          startSurah: 1,
          startVerse: 8,
          endSurah: 1,
          endVerse: 8,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects end_verse > total verses in end_surah', () => {
      expect(() =>
        validator.validate({
          startSurah: 1,
          startVerse: 1,
          endSurah: 1,
          endVerse: 8,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects end_verse < start_verse within same surah', () => {
      expect(() =>
        validator.validate({
          startSurah: 2,
          startVerse: 10,
          endSurah: 2,
          endVerse: 5,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects start_verse < 1', () => {
      expect(() =>
        validator.validate({
          startSurah: 1,
          startVerse: 0,
          endSurah: 1,
          endVerse: 1,
        }),
      ).toThrow(BadRequestException);
    });
  });

  // ─── countVerses() ────────────────────────────────────────────────────────

  describe('countVerses()', () => {
    it('counts a same-surah full range', () => {
      // Al-Fatihah: 7 verses
      expect(
        validator.countVerses({
          startSurah: 1,
          startVerse: 1,
          endSurah: 1,
          endVerse: 7,
        }),
      ).toBe(7);
    });

    it('counts a single verse', () => {
      expect(
        validator.countVerses({
          startSurah: 2,
          startVerse: 255,
          endSurah: 2,
          endVerse: 255,
        }),
      ).toBe(1);
    });

    it('counts a partial same-surah range', () => {
      expect(
        validator.countVerses({
          startSurah: 2,
          startVerse: 1,
          endSurah: 2,
          endVerse: 5,
        }),
      ).toBe(5);
    });

    it('counts a cross-surah range spanning two adjacent surahs', () => {
      // Al-Fatihah last verse (7) through Al-Baqarah first 3 verses
      // = 1 (verse 7 of surah 1) + 3 (verses 1-3 of surah 2) = 4
      expect(
        validator.countVerses({
          startSurah: 1,
          startVerse: 7,
          endSurah: 2,
          endVerse: 3,
        }),
      ).toBe(4);
    });

    it('counts a cross-surah range spanning three surahs', () => {
      // Surah 1 from verse 1 to surah 3 verse 5
      // surah 1 remaining: 7 - 1 + 1 = 7
      // surah 2 full: 286
      // surah 3 first 5: 5
      // total = 7 + 286 + 5 = 298
      expect(
        validator.countVerses({
          startSurah: 1,
          startVerse: 1,
          endSurah: 3,
          endVerse: 5,
        }),
      ).toBe(298);
    });

    it('counts full surah Al-Baqarah', () => {
      expect(
        validator.countVerses({
          startSurah: 2,
          startVerse: 1,
          endSurah: 2,
          endVerse: 286,
        }),
      ).toBe(286);
    });

    it('matches SURAH_VERSES for any full single surah', () => {
      for (let s = 1; s <= 114; s++) {
        const count = validator.countVerses({
          startSurah: s,
          startVerse: 1,
          endSurah: s,
          endVerse: SURAH_VERSES[s],
        });
        expect(count).toBe(SURAH_VERSES[s]);
      }
    });
  });
});
