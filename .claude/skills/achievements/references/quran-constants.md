# Quran constants

Lives at `src/quran/quran.constants.ts`. 1-indexed arrays with a dummy `0` slot at index 0 to allow direct subscripting (`SURAH_VERSES[2]` = Al-Baqarah's verse count = 286).

This data is reference data. It's not config — it doesn't vary by deployment.

## Structure

```ts
// src/quran/quran.constants.ts

export const SURAH_COUNT = 114;

/**
 * Verse counts per surah. 1-indexed; index 0 is unused.
 * SURAH_VERSES[N] = total verses in surah N.
 */
export const SURAH_VERSES: readonly number[] = [
  0,    // unused
  7,    // 1  الفاتحة        Al-Fatihah
  286,  // 2  البقرة         Al-Baqarah
  200,  // 3  آل عمران       Al-Imran
  176,  // 4  النساء         An-Nisa
  120,  // 5  المائدة        Al-Maidah
  165,  // 6  الأنعام        Al-Anam
  206,  // 7  الأعراف        Al-Araf
  75,   // 8  الأنفال        Al-Anfal
  129,  // 9  التوبة         At-Tawbah
  109,  // 10 يونس           Yunus
  123,  // 11 هود            Hud
  111,  // 12 يوسف           Yusuf
  43,   // 13 الرعد          Ar-Rad
  52,   // 14 إبراهيم        Ibrahim
  99,   // 15 الحجر          Al-Hijr
  128,  // 16 النحل          An-Nahl
  111,  // 17 الإسراء        Al-Isra
  110,  // 18 الكهف          Al-Kahf
  98,   // 19 مريم           Maryam
  135,  // 20 طه             Ta-Ha
  112,  // 21 الأنبياء       Al-Anbiya
  78,   // 22 الحج           Al-Hajj
  118,  // 23 المؤمنون       Al-Muminun
  64,   // 24 النور          An-Nur
  77,   // 25 الفرقان        Al-Furqan
  227,  // 26 الشعراء        Ash-Shuara
  93,   // 27 النمل          An-Naml
  88,   // 28 القصص          Al-Qasas
  69,   // 29 العنكبوت       Al-Ankabut
  60,   // 30 الروم          Ar-Rum
  34,   // 31 لقمان          Luqman
  30,   // 32 السجدة         As-Sajdah
  73,   // 33 الأحزاب        Al-Ahzab
  54,   // 34 سبأ            Saba
  45,   // 35 فاطر           Fatir
  83,   // 36 يس             Ya-Sin
  182,  // 37 الصافات        As-Saffat
  88,   // 38 ص              Sad
  75,   // 39 الزمر          Az-Zumar
  85,   // 40 غافر           Ghafir
  54,   // 41 فصلت           Fussilat
  53,   // 42 الشورى         Ash-Shura
  89,   // 43 الزخرف         Az-Zukhruf
  59,   // 44 الدخان         Ad-Dukhan
  37,   // 45 الجاثية        Al-Jathiyah
  35,   // 46 الأحقاف        Al-Ahqaf
  38,   // 47 محمد           Muhammad
  29,   // 48 الفتح          Al-Fath
  18,   // 49 الحجرات        Al-Hujurat
  45,   // 50 ق              Qaf
  60,   // 51 الذاريات       Adh-Dhariyat
  49,   // 52 الطور          At-Tur
  62,   // 53 النجم          An-Najm
  55,   // 54 القمر          Al-Qamar
  78,   // 55 الرحمن         Ar-Rahman
  96,   // 56 الواقعة        Al-Waqiah
  29,   // 57 الحديد         Al-Hadid
  22,   // 58 المجادلة       Al-Mujadilah
  24,   // 59 الحشر          Al-Hashr
  13,   // 60 الممتحنة       Al-Mumtahanah
  14,   // 61 الصف           As-Saff
  11,   // 62 الجمعة         Al-Jumuah
  11,   // 63 المنافقون      Al-Munafiqun
  18,   // 64 التغابن        At-Taghabun
  12,   // 65 الطلاق         At-Talaq
  12,   // 66 التحريم        At-Tahrim
  30,   // 67 الملك          Al-Mulk
  52,   // 68 القلم          Al-Qalam
  52,   // 69 الحاقة         Al-Haqqah
  44,   // 70 المعارج        Al-Maarij
  28,   // 71 نوح            Nuh
  28,   // 72 الجن           Al-Jinn
  20,   // 73 المزمل         Al-Muzzammil
  56,   // 74 المدثر         Al-Muddathir
  40,   // 75 القيامة        Al-Qiyamah
  31,   // 76 الإنسان        Al-Insan
  50,   // 77 المرسلات       Al-Mursalat
  40,   // 78 النبأ          An-Naba
  46,   // 79 النازعات       An-Naziat
  42,   // 80 عبس            Abasa
  29,   // 81 التكوير        At-Takwir
  19,   // 82 الانفطار       Al-Infitar
  36,   // 83 المطففين       Al-Mutaffifin
  25,   // 84 الانشقاق       Al-Inshiqaq
  22,   // 85 البروج         Al-Buruj
  17,   // 86 الطارق         At-Tariq
  19,   // 87 الأعلى         Al-Ala
  26,   // 88 الغاشية        Al-Ghashiyah
  30,   // 89 الفجر          Al-Fajr
  20,   // 90 البلد          Al-Balad
  15,   // 91 الشمس          Ash-Shams
  21,   // 92 الليل          Al-Layl
  11,   // 93 الضحى          Ad-Duha
  8,    // 94 الشرح          Ash-Sharh
  8,    // 95 التين          At-Tin
  19,   // 96 العلق          Al-Alaq
  5,    // 97 القدر          Al-Qadr
  8,    // 98 البينة         Al-Bayyinah
  8,    // 99 الزلزلة        Az-Zalzalah
  11,   // 100 العاديات      Al-Adiyat
  11,   // 101 القارعة       Al-Qariah
  8,    // 102 التكاثر       At-Takathur
  3,    // 103 العصر         Al-Asr
  9,    // 104 الهمزة        Al-Humazah
  5,    // 105 الفيل         Al-Fil
  4,    // 106 قريش          Quraysh
  7,    // 107 الماعون       Al-Maun
  3,    // 108 الكوثر        Al-Kawthar
  6,    // 109 الكافرون      Al-Kafirun
  3,    // 110 النصر         An-Nasr
  5,    // 111 المسد         Al-Masad
  4,    // 112 الإخلاص       Al-Ikhlas
  5,    // 113 الفلق         Al-Falaq
  6,    // 114 الناس         An-Nas
];

export const SURAH_NAMES_AR: readonly string[] = [
  '',                  // unused
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة',
  'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر',
  'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان',
  'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر',
  'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية',
  'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن',
  'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق',
  'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة',
  'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج',
  'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين',
  'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل',
  'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس',
];

export const SURAH_NAMES_EN: readonly string[] = [
  '',                  // unused
  'Al-Fatihah', 'Al-Baqarah', 'Al-Imran', 'An-Nisa', 'Al-Maidah',
  'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus',
  'Hud', 'Yusuf', 'Ar-Rad', 'Ibrahim', 'Al-Hijr',
  'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan',
  'Ash-Shuara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir',
  'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
  'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman',
  'Al-Waqiah', 'Al-Hadid', 'Al-Mujadilah', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq',
  'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Maarij',
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddathir', 'Al-Qiyamah',
  'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Naziat', 'Abasa',
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj',
  'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin',
  'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
  'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil',
  'Quraysh', 'Al-Maun', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];
```

## Validator

```ts
// src/quran/quran-range.validator.ts

import { SURAH_VERSES } from './quran.constants';

export interface VerseRange {
  start_surah: number;
  start_verse: number;
  end_surah: number;
  end_verse: number;
}

export class QuranRangeValidator {
  /** Throws BadRequestException with a precise message if the range is invalid. */
  validateOrThrow(range: VerseRange): void {
    const { start_surah, start_verse, end_surah, end_verse } = range;

    if (start_surah < 1 || start_surah > 114) {
      throw new BadRequestException(`start_surah out of range: ${start_surah}`);
    }
    if (end_surah < 1 || end_surah > 114) {
      throw new BadRequestException(`end_surah out of range: ${end_surah}`);
    }
    if (end_surah < start_surah) {
      throw new BadRequestException('end_surah must be >= start_surah');
    }
    if (start_verse < 1 || start_verse > SURAH_VERSES[start_surah]) {
      throw new BadRequestException(
        `start_verse ${start_verse} invalid for surah ${start_surah} (max ${SURAH_VERSES[start_surah]})`,
      );
    }
    if (end_verse < 1 || end_verse > SURAH_VERSES[end_surah]) {
      throw new BadRequestException(
        `end_verse ${end_verse} invalid for surah ${end_surah} (max ${SURAH_VERSES[end_surah]})`,
      );
    }
    if (start_surah === end_surah && end_verse < start_verse) {
      throw new BadRequestException('end_verse must be >= start_verse when in same surah');
    }
  }

  /** Total verses in the range. Assumes validateOrThrow has already passed. */
  countVerses(range: VerseRange): number {
    const { start_surah, start_verse, end_surah, end_verse } = range;
    if (start_surah === end_surah) {
      return end_verse - start_verse + 1;
    }
    let total = SURAH_VERSES[start_surah] - start_verse + 1;
    for (let s = start_surah + 1; s < end_surah; s++) {
      total += SURAH_VERSES[s];
    }
    total += end_verse;
    return total;
  }

  /** Yields all (surah, verse) pairs in the range, in order. */
  *iterateVerses(range: VerseRange): Generator<{ surah: number; verse: number }> {
    const { start_surah, start_verse, end_surah, end_verse } = range;
    for (let s = start_surah; s <= end_surah; s++) {
      const from = s === start_surah ? start_verse : 1;
      const to = s === end_surah ? end_verse : SURAH_VERSES[s];
      for (let v = from; v <= to; v++) {
        yield { surah: s, verse: v };
      }
    }
  }
}
```

The `iterateVerses` generator is used by the reconciliation service to build the set union of verses across multiple achievements. For the typical session size (tens to low hundreds of verses), this is fine. If sessions ever cover thousands of verses, switch to interval arithmetic.

## Verifying the verse counts

The total verse count of the Quran is **6,236**. To sanity-check your data on startup:

```ts
const total = SURAH_VERSES.reduce((a, b) => a + b, 0);
assert(total === 6236, `SURAH_VERSES sum is ${total}, expected 6236`);
```

Run this in a startup health check or as a unit test. If it ever fails, the constants file has been corrupted.
