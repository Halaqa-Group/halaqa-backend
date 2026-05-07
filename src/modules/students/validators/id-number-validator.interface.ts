export interface IdNumberValidationResult {
  /** False ONLY when the format is wrong. A bad checksum returns ok: true with a warning. */
  ok: boolean;
  /** Machine codes, not user-facing strings. e.g. ['checksum_invalid'] */
  warnings: string[];
}

export interface IdNumberValidator {
  /**
   * Strip whitespace and '-', convert Arabic-Indic (U+0660–U+0669) and
   * Persian (U+06F0–U+06F9) digits to ASCII. Does NOT trim length.
   */
  normalize(input: string): string;

  /** Run after normalize(). Format and checksum logic lives here. */
  validate(normalized: string): IdNumberValidationResult;
}
