/**
 * Shared handling for the WhatsApp contact number stored on `students`.
 *
 * The dial code (`+970`) is kept in its own column, apart from the national
 * number (`599123456`), so a country picker round-trips exactly. Splitting a
 * stored E.164 string back into (country, number) is ambiguous the moment you
 * leave the +9xx range — `+1` alone covers the US, Canada and a dozen Caribbean
 * codes — and the UI needs the country back to preselect it.
 */

/** Longest dial code is `+`, then 4 digits; the column is sized with slack. */
export const PHONE_COUNTRY_CODE_MAX_LENGTH = 8;

export const PHONE_NUMBER_MAX_LENGTH = 20;

/** `+` followed by 1..4 digits — the ITU dial-code range. */
export const PHONE_COUNTRY_CODE_PATTERN = /^\+\d{1,4}$/;

/** National number, dial code excluded. E.164 caps the two together at 15 digits. */
export const PHONE_NUMBER_PATTERN = /^\d{4,15}$/;

const ARABIC_INDIC_OFFSET = 0x0660 - 0x30;
const PERSIAN_OFFSET = 0x06f0 - 0x30;

/**
 * Arabic-Indic (٠١٢) and Persian (۰۱۲) digits → ASCII, with the separators
 * people type by hand (spaces, dashes, parentheses, dots) dropped. Mirrors
 * `normalizeDigits` in the frontend so both ends agree on what was submitted.
 */
export function normalizePhoneDigits(input: string): string {
  return [...input.trim()]
    .filter((ch) => !/[\s\-().]/.test(ch))
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669)
        return String.fromCharCode(code - ARABIC_INDIC_OFFSET);
      if (code >= 0x06f0 && code <= 0x06f9)
        return String.fromCharCode(code - PERSIAN_OFFSET);
      return ch;
    })
    .join('');
}

/** Normalises a dial code to `+<digits>`, tolerating `00970` and a bare `970`. */
export function normalizeCountryCode(input: string): string {
  const digits = normalizePhoneDigits(input).replace(/^\+/, '');
  return `+${digits.replace(/^00/, '')}`;
}

/**
 * Normalises a national number: ASCII digits only, with the national trunk
 * prefix stripped — people write `0599123456` but E.164 wants `599123456`.
 */
export function normalizePhoneNumber(input: string): string {
  return normalizePhoneDigits(input).replace(/^0+/, '');
}

/** `+970599123456`, or null when either half is missing. */
export function toE164(
  countryCode: string | null,
  phone: string | null,
): string | null {
  if (!countryCode || !phone) return null;
  return `${countryCode}${phone}`;
}
