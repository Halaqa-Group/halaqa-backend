import { PalestinianIdValidator } from './palestinian-id.validator';

describe('PalestinianIdValidator', () => {
  const v = new PalestinianIdValidator();

  // ── normalize ──────────────────────────────────────────────────────────────

  describe('normalize', () => {
    it('strips ASCII hyphens', () => {
      expect(v.normalize('300-123-456')).toBe('300123456');
    });

    it('strips spaces', () => {
      expect(v.normalize('300 123 456')).toBe('300123456');
    });

    it('strips leading/trailing whitespace', () => {
      expect(v.normalize('  300123456  ')).toBe('300123456');
    });

    it('converts Arabic-Indic digits (U+0660–U+0669)', () => {
      expect(v.normalize('٣٠٠١٢٣٤٥٦')).toBe('300123456');
    });

    it('converts Persian digits (U+06F0–U+06F9)', () => {
      expect(v.normalize('۳۰۰۱۲۳۴۵۶')).toBe('300123456');
    });

    it('preserves leading zeros', () => {
      expect(v.normalize('012345678')).toBe('012345678');
    });

    it('does not trim length', () => {
      expect(v.normalize('1234567890')).toBe('1234567890');
    });

    it('returns empty string unchanged', () => {
      expect(v.normalize('')).toBe('');
    });
  });

  // ── validate ───────────────────────────────────────────────────────────────

  describe('validate', () => {
    it('rejects empty string', () => {
      expect(v.validate('')).toEqual({ ok: false, warnings: [] });
    });

    it('rejects 8-digit value', () => {
      expect(v.validate('30012345')).toEqual({ ok: false, warnings: [] });
    });

    it('rejects 10-digit value', () => {
      expect(v.validate('3001234567')).toEqual({ ok: false, warnings: [] });
    });

    it('rejects value with non-digit character', () => {
      expect(v.validate('30012345a')).toEqual({ ok: false, warnings: [] });
    });

    it('rejects value with hyphen (not pre-normalized)', () => {
      expect(v.validate('300-12345')).toEqual({ ok: false, warnings: [] });
    });

    it('accepts 9-digit value with valid checksum', () => {
      // Use the checksum formula: build a value whose check digit is correct
      // digits: 1,0,0,0,0,0,0,0,? — sum = 1*1 + 0*2 + 0*1 + 0*2 + 0*1 + 0*2 + 0*1 + 0*2 = 1
      // check = (10 - (1 % 10)) % 10 = 9
      const result = v.validate('100000009');
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('accepts 9-digit value with bad checksum and returns warning', () => {
      // '100000000' — check digit 0, but correct is 9
      const result = v.validate('100000000');
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual(['checksum_invalid']);
    });

    it('accepts another valid checksum: 300123456 shape (illustrative)', () => {
      // Build a correct ID:
      // digits 3,0,0,1,2,3,4,5,? with multipliers [1,2,1,2,1,2,1,2]
      // 3*1=3, 0*2=0, 0*1=0, 1*2=2, 2*1=2, 3*2=6, 4*1=4, 5*2=10→1, sum=18
      // check = (10 - 18%10) % 10 = (10-8)%10 = 2
      const result = v.validate('300123452');
      expect(result.ok).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });
});
