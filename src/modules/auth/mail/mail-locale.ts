export const MAIL_LOCALES = ['ar', 'en'] as const;

export type MailLocale = (typeof MAIL_LOCALES)[number];

/** Matches the frontend's `i18n.defaultLocale` in `nuxt.config.ts`. */
export const DEFAULT_MAIL_LOCALE: MailLocale = 'ar';

/**
 * Picks the best supported language from an `Accept-Language` header, falling
 * back to the app default when the header is absent or offers nothing we speak.
 */
export function resolveMailLocale(
  header: string | string[] | null | undefined,
): MailLocale {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return DEFAULT_MAIL_LOCALE;

  const ranked = raw
    .split(',')
    .map(parseLanguageRange)
    .filter((range) => range.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    const match = MAIL_LOCALES.find((locale) => locale === base);
    if (match) return match;
  }
  return DEFAULT_MAIL_LOCALE;
}

function parseLanguageRange(part: string): { tag: string; quality: number } {
  const [tag, ...params] = part.split(';');
  const weight = params.find((p) => p.trim().startsWith('q='));
  const quality = weight ? Number.parseFloat(weight.split('=')[1]) : 1;
  return {
    tag: tag.trim().toLowerCase(),
    quality: Number.isFinite(quality) ? quality : 0,
  };
}
