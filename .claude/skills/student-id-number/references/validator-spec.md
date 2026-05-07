# Validator spec

## Interface

```ts
// students/validators/id-number-validator.interface.ts

export interface IdNumberValidationResult {
  /**
   * False ONLY when the format is wrong (e.g. wrong length, contains non-digits
   * after normalization). A bad checksum returns ok: true with a warning.
   */
  ok: boolean;

  /** Codes; not user-facing strings. e.g. ['checksum_invalid']. */
  warnings: string[];
}

export interface IdNumberValidator {
  /**
   * Pure function. Pre-storage and pre-comparison cleanup.
   *
   *  - strip all whitespace
   *  - strip ASCII hyphen-minus '-'
   *  - convert Arabic-Indic digits (U+0660..U+0669) to ASCII '0'..'9'
   *  - convert Persian digits (U+06F0..U+06F9) to ASCII '0'..'9'
   *
   * Does NOT strip leading zeros (a 9-digit Palestinian ID may start with 0).
   * Does NOT trim length. Length is the validator's job, not normalization's.
   */
  normalize(input: string): string;

  /** Run after normalize(). Length and digit checks live here. */
  validate(normalized: string): IdNumberValidationResult;
}
```

## Palestinian implementation

```ts
// students/validators/palestinian-id.validator.ts

const ARABIC_INDIC_OFFSET = 0x0660 - 0x30;   // ٠ → 0
const PERSIAN_OFFSET      = 0x06F0 - 0x30;   // ۰ → 0

export class PalestinianIdValidator implements IdNumberValidator {
  normalize(input: string): string {
    return [...input]
      .filter(ch => !/\s|-/.test(ch))
      .map(ch => {
        const code = ch.charCodeAt(0);
        if (code >= 0x0660 && code <= 0x0669) {
          return String.fromCharCode(code - ARABIC_INDIC_OFFSET);
        }
        if (code >= 0x06F0 && code <= 0x06F9) {
          return String.fromCharCode(code - PERSIAN_OFFSET);
        }
        return ch;
      })
      .join('');
  }

  validate(normalized: string): IdNumberValidationResult {
    if (!/^\d{9}$/.test(normalized)) {
      return { ok: false, warnings: [] };
    }
    const warnings: string[] = [];
    if (!this.checksumValid(normalized)) {
      warnings.push('checksum_invalid');
    }
    return { ok: true, warnings };
  }

  private checksumValid(idNumber: string): boolean {
    // Standard Palestinian/Israeli ID checksum (Luhn-like):
    //   for each of the first 8 digits at index i (0-based),
    //     multiply by (i % 2 === 0 ? 1 : 2)
    //     if product > 9, sum its digits (equivalent: subtract 9)
    //     accumulate
    //   the 9th digit must be (10 - (sum % 10)) % 10
    const digits = [...idNumber].map(d => parseInt(d, 10));
    const checksum = digits[8];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      let d = digits[i] * (i % 2 === 0 ? 1 : 2);
      if (d > 9) d -= 9;
      sum += d;
    }
    return ((10 - (sum % 10)) % 10) === checksum;
  }
}
```

## Why these choices

- **Normalization is country-agnostic in spirit.** Stripping whitespace and dashes, converting Arabic-Indic and Persian digits to ASCII — these are all things any Arabic-speaking school is going to need. A future Jordanian validator inherits the same `normalize` logic; only the format and checksum differ. If you find yourself duplicating `normalize` across implementations, factor it into an abstract base class.
- **Checksum as warning, not error.** Real-world data has invalid checksums (paper records, foreign-issued numbers, transcription errors that can't be fixed on the spot). A hard reject would block legitimate enrollments. The warning is enough signal for a future "data quality" report.
- **No regex on the DTO.** The DTO only checks "string up to 20 chars." All format and checksum logic is the validator's job. This keeps the format choice in one place when you swap countries.

## Adding a new country

1. Create `students/validators/<country>-id.validator.ts` implementing `IdNumberValidator`.
2. In `students.module.ts`, change the binding:

   ```ts
   { provide: 'ID_NUMBER_VALIDATOR', useClass: JordanianIdValidator }
   ```

3. Update tests for the new format. Existing students with old-format ID numbers don't migrate automatically — they remain stored as-is. If you need to re-validate them, write a one-off script.

## Test cases

```
normalize('300-123-456')  → '300123456'
normalize('300 123 456')  → '300123456'
normalize('٣٠٠١٢٣٤٥٦')   → '300123456'
normalize('۳۰۰۱۲۳۴۵۶')    → '300123456'
normalize('  300123456  ') → '300123456'

validate('300123456')  → { ok: true, warnings: [] }    // valid checksum (verify with real example)
validate('300123450')  → { ok: true, warnings: ['checksum_invalid'] }
validate('30012345')   → { ok: false, warnings: [] }   // 8 digits
validate('3001234567') → { ok: false, warnings: [] }   // 10 digits
validate('30012345a')  → { ok: false, warnings: [] }   // non-digit
validate('')           → { ok: false, warnings: [] }
```

> Note: pick a known-valid Palestinian ID from real test data when writing the positive checksum case. The example numbers above are illustrative.
