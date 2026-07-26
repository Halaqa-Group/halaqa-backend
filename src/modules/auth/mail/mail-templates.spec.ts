import { mailLogo, renderMailHtml, renderMailText } from './mail-layout';
import { resolveMailLocale } from './mail-locale';
import { verificationEmail } from './mail-templates';

const LINK = 'https://app.halaqa.ps/auth/verify-email?token=abc123';

describe('resolveMailLocale', () => {
  it('defaults to Arabic when the header is missing or unsupported', () => {
    expect(resolveMailLocale(undefined)).toBe('ar');
    expect(resolveMailLocale('')).toBe('ar');
    expect(resolveMailLocale('fr-FR,de;q=0.8')).toBe('ar');
    expect(resolveMailLocale('*')).toBe('ar');
  });

  it('matches a supported language regardless of region or case', () => {
    expect(resolveMailLocale('en-GB')).toBe('en');
    expect(resolveMailLocale('AR-PS')).toBe('ar');
    expect(resolveMailLocale(['en-US,en;q=0.9'])).toBe('en');
  });

  it('honours quality weights over header order', () => {
    expect(resolveMailLocale('ar;q=0.3,en;q=0.9')).toBe('en');
    expect(resolveMailLocale('en;q=0.2,ar;q=0.7')).toBe('ar');
    expect(resolveMailLocale('en;q=0')).toBe('ar');
  });
});

describe('verification email', () => {
  it('renders right-to-left Arabic with the logo and the link', () => {
    const content = verificationEmail('ar', LINK);
    const html = renderMailHtml(content, 'ar', 'cid:halaqa-logo');

    expect(content.subject).toContain('مدرسة الإتقان');
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('src="cid:halaqa-logo"');
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain('أكّد بريدك الإلكتروني');
  });

  it('renders left-to-right English from the same content shape', () => {
    const html = renderMailHtml(
      verificationEmail('en', LINK),
      'en',
      'cid:halaqa-logo',
    );

    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('Confirm your email');
    expect(html).toContain('Al-Itqan School');
  });

  it('escapes markup in interpolated values', () => {
    const html = renderMailHtml(
      verificationEmail('en', 'https://x.test/?a=1&b="><script>'),
      'en',
      'cid:halaqa-logo',
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&amp;b=&quot;&gt;&lt;script&gt;');
  });

  it('carries a plain-text alternative with the same link', () => {
    const text = renderMailText(verificationEmail('en', LINK), 'en');

    expect(text).toContain(LINK);
    expect(text).toContain('Al-Itqan School — Quran Memorization');
    expect(text).not.toContain('<');
  });
});

describe('mailLogo', () => {
  it('embeds the bundled logo as an inline CID attachment', () => {
    const logo = mailLogo('https://app.halaqa.ps');

    expect(logo.src).toBe('cid:halaqa-logo');
    expect(logo.attachments).toHaveLength(1);
    expect(logo.attachments[0]).toMatchObject({
      cid: 'halaqa-logo',
      contentType: 'image/png',
    });
  });
});
