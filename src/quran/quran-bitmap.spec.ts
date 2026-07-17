import {
  MEMORIZATION_BYTES,
  TOTAL_AYAT,
  ayahIndex,
  applyRange,
  countBits,
  createEmptyBitmap,
  getBit,
  toBitmap,
} from './quran-bitmap';

describe('quran-bitmap', () => {
  it('maps ayah locations to global indices', () => {
    expect(ayahIndex(1, 1)).toBe(0); // Al-Fatihah:1
    expect(ayahIndex(1, 7)).toBe(6); // Al-Fatihah:7
    expect(ayahIndex(2, 1)).toBe(7); // Al-Baqarah:1 (7 ayat before)
    expect(ayahIndex(114, 6)).toBe(TOTAL_AYAT - 1); // last ayah of the mushaf
  });

  it('has 6236 ayat packed into 780 bytes', () => {
    expect(TOTAL_AYAT).toBe(6236);
    expect(MEMORIZATION_BYTES).toBe(780);
    expect(createEmptyBitmap()).toHaveLength(780);
  });

  it('sets and counts a single-surah range', () => {
    const buf = createEmptyBitmap();
    applyRange(buf, { startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 });
    expect(countBits(buf)).toBe(7);
    expect(getBit(buf, ayahIndex(1, 1))).toBe(true);
    expect(getBit(buf, ayahIndex(1, 7))).toBe(true);
    expect(getBit(buf, ayahIndex(2, 1))).toBe(false);
  });

  it('sets a cross-surah range spanning whole surahs', () => {
    const buf = createEmptyBitmap();
    // Al-Fatihah:5 .. Al-Baqarah:3 = (7-5+1)=3 + 3 = 6 ayat
    applyRange(buf, { startSurah: 1, startVerse: 5, endSurah: 2, endVerse: 3 });
    expect(countBits(buf)).toBe(6);
    expect(getBit(buf, ayahIndex(1, 4))).toBe(false);
    expect(getBit(buf, ayahIndex(1, 5))).toBe(true);
    expect(getBit(buf, ayahIndex(2, 3))).toBe(true);
    expect(getBit(buf, ayahIndex(2, 4))).toBe(false);
  });

  it('clears a sub-range without touching the rest', () => {
    const buf = createEmptyBitmap();
    applyRange(
      buf,
      { startSurah: 2, startVerse: 1, endSurah: 2, endVerse: 10 },
      true,
    );
    applyRange(
      buf,
      { startSurah: 2, startVerse: 4, endSurah: 2, endVerse: 6 },
      false,
    );
    expect(countBits(buf)).toBe(7); // 10 - 3
    expect(getBit(buf, ayahIndex(2, 3))).toBe(true);
    expect(getBit(buf, ayahIndex(2, 5))).toBe(false);
    expect(getBit(buf, ayahIndex(2, 7))).toBe(true);
  });

  it('round-trips through base64 and zero-pads short buffers', () => {
    const buf = createEmptyBitmap();
    applyRange(buf, {
      startSurah: 36,
      startVerse: 1,
      endSurah: 36,
      endVerse: 83,
    }); // Ya-Sin
    const restored = toBitmap(Buffer.from(buf.toString('base64'), 'base64'));
    expect(countBits(restored)).toBe(83);
    // a short/legacy value still normalizes to full length
    expect(toBitmap(Buffer.alloc(10))).toHaveLength(MEMORIZATION_BYTES);
    expect(toBitmap(null)).toHaveLength(MEMORIZATION_BYTES);
  });
});
