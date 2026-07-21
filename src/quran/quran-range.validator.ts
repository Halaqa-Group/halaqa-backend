import { BadRequestException, Injectable } from '@nestjs/common';
import { SURAH_VERSES } from './quran.constants';

export interface VerseRange {
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

@Injectable()
export class QuranRangeValidator {
  validate(range: VerseRange): void {
    const { startSurah, startVerse, endSurah, endVerse } = range;

    if (startSurah < 1 || startSurah > 114) {
      throw new BadRequestException(`start_surah must be between 1 and 114`);
    }
    if (endSurah < 1 || endSurah > 114) {
      throw new BadRequestException(`end_surah must be between 1 and 114`);
    }
    if (endSurah < startSurah) {
      throw new BadRequestException(`end_surah must be >= start_surah`);
    }
    if (startVerse < 1 || startVerse > SURAH_VERSES[startSurah]) {
      throw new BadRequestException(
        `start_verse must be between 1 and ${SURAH_VERSES[startSurah]} for surah ${startSurah}`,
      );
    }
    if (endVerse < 1 || endVerse > SURAH_VERSES[endSurah]) {
      throw new BadRequestException(
        `end_verse must be between 1 and ${SURAH_VERSES[endSurah]} for surah ${endSurah}`,
      );
    }
    if (startSurah === endSurah && endVerse < startVerse) {
      throw new BadRequestException(
        `end_verse must be >= start_verse within the same surah`,
      );
    }
  }

  countVerses(range: VerseRange): number {
    const { startSurah, startVerse, endSurah, endVerse } = range;

    if (startSurah === endSurah) {
      return endVerse - startVerse + 1;
    }

    let total = SURAH_VERSES[startSurah] - startVerse + 1;
    for (let s = startSurah + 1; s < endSurah; s++) {
      total += SURAH_VERSES[s];
    }
    total += endVerse;

    return total;
  }
}
