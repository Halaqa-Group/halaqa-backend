import { SURAH_VERSES } from './quran.constants';

/**
 * A fixed bitmap over every ayah of the mushaf, one bit per ayah in mushaf
 * order. Bit `i` (0-based) is the `i`-th ayah counting from Al-Fatihah:1.
 *
 * MySQL's `BIT` type caps at 64 bits, so this is stored as a `BINARY(780)`
 * column (780 bytes × 8 = 6240 bits ≥ 6236). Bits are packed MSB-first within
 * each byte: ayah index `i` lives at byte `i >> 3`, bit `7 - (i & 7)`.
 */
export const TOTAL_AYAT = 6236;
export const MEMORIZATION_BYTES = 780; // Math.ceil(6236 / 8)

/**
 * `SURAH_AYAH_OFFSET[s]` = number of ayat before surah `s` (1-indexed).
 * So the global 0-based index of (surah, ayah) is `OFFSET[surah] + ayah - 1`.
 */
const SURAH_AYAH_OFFSET: number[] = (() => {
  const offset = new Array<number>(116).fill(0);
  for (let s = 1; s <= 114; s++) offset[s + 1] = offset[s] + SURAH_VERSES[s];
  return offset;
})();

/** Global 0-based ayah index for (surah, ayah). Assumes a validated location. */
export function ayahIndex(surah: number, ayah: number): number {
  return SURAH_AYAH_OFFSET[surah] + ayah - 1;
}

export function createEmptyBitmap(): Buffer {
  return Buffer.alloc(MEMORIZATION_BYTES);
}

/**
 * Normalizes a stored value into a full-length bitmap buffer: null/short values
 * are zero-padded to MEMORIZATION_BYTES, longer ones are truncated.
 */
export function toBitmap(stored: Buffer | null | undefined): Buffer {
  const buf = createEmptyBitmap();
  if (stored && stored.length)
    stored.copy(buf, 0, 0, Math.min(stored.length, MEMORIZATION_BYTES));
  return buf;
}

export function getBit(buf: Buffer, index: number): boolean {
  if (index < 0 || index >= TOTAL_AYAT) return false;
  return (buf[index >> 3] & (0x80 >> (index & 7))) !== 0;
}

function writeBit(buf: Buffer, index: number, value: boolean): void {
  if (index < 0 || index >= TOTAL_AYAT) return;
  const byte = index >> 3;
  const mask = 0x80 >> (index & 7);
  if (value) buf[byte] |= mask;
  else buf[byte] &= ~mask;
}

export interface VerseRange {
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

/**
 * Sets (value=true) or clears (value=false) every ayah in a verse range, in
 * place. Cross-surah ranges walk whole surahs between the endpoints. The range
 * is assumed already validated (see QuranRangeValidator).
 */
export function applyRange(buf: Buffer, range: VerseRange, value = true): void {
  const start = ayahIndex(range.startSurah, range.startVerse);
  const end = ayahIndex(range.endSurah, range.endVerse);
  for (let i = start; i <= end; i++) writeBit(buf, i, value);
}

/** Count of set bits (memorized ayat). */
export function countBits(buf: Buffer): number {
  let count = 0;
  for (let b = 0; b < buf.length; b++) {
    let v = buf[b];
    while (v) {
      v &= v - 1;
      count++;
    }
  }
  return count;
}
