import { Injectable } from '@nestjs/common';
import type {
  IdNumberValidationResult,
  IdNumberValidator,
} from './id-number-validator.interface';

const ARABIC_INDIC_OFFSET = 0x0660 - 0x30; // ٠ → 0
const PERSIAN_OFFSET = 0x06f0 - 0x30; // ۰ → 0

@Injectable()
export class PalestinianIdValidator implements IdNumberValidator {
  normalize(input: string): string {
    return [...input]
      .filter((ch) => !/\s|-/.test(ch))
      .map((ch) => {
        const code = ch.charCodeAt(0);
        if (code >= 0x0660 && code <= 0x0669) {
          return String.fromCharCode(code - ARABIC_INDIC_OFFSET);
        }
        if (code >= 0x06f0 && code <= 0x06f9) {
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
    //     if product > 9, subtract 9
    //     accumulate
    //   the 9th digit must equal (10 - (sum % 10)) % 10
    const digits = [...idNumber].map((d) => parseInt(d, 10));
    const checkDigit = digits[8];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      let d = digits[i] * (i % 2 === 0 ? 1 : 2);
      if (d > 9) d -= 9;
      sum += d;
    }
    return (10 - (sum % 10)) % 10 === checkDigit;
  }
}
