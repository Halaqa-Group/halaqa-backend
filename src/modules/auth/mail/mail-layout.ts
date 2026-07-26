import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Attachment } from 'nodemailer/lib/mailer';
import type { MailLocale } from './mail-locale';

/**
 * Body copy of one transactional email, before it is wrapped in the branded
 * shell. Every field is already localized by the template that produced it.
 */
export interface MailContent {
  /** Identifies the email in dev-transport logs only. */
  kind: string;
  subject: string;
  /** Inbox preview line — shown next to the subject, hidden inside the body. */
  preheader: string;
  title: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  /** Short expiry / single-use note, rendered as a tinted callout. */
  notice: string;
  footerNote: string;
}

/** Mirrors the frontend design tokens in `app/assets/css/main.css`. */
const BRAND = {
  primary: '#1a6b4a',
  primaryDeep: '#124d35',
  primarySoft: '#e8f5ef',
  secondary: '#c9a84c',
  background: '#f9f9f9',
  card: '#ffffff',
  cardBorder: '#e0dfe0',
  onSurface: '#1a1c1c',
  onSurfaceVariant: '#4e444c',
  outline: '#80737c',
} as const;

/**
 * `Thmanyah Sans` is the app face but web fonts are unreliable in mail clients,
 * so the stack degrades to faces that render Arabic well on every platform.
 */
const FONT_STACK =
  "'Thmanyah Sans', 'Segoe UI', Tahoma, 'Helvetica Neue', Arial, sans-serif";

const LOGO_CID = 'halaqa-logo';
const LOGO_FILENAME = 'halaqa-logo.png';
const LOGO_PATH = join(__dirname, 'assets', LOGO_FILENAME);

const CHROME = {
  ar: {
    dir: 'rtl',
    align: 'right',
    appName: 'مدرسة الإتقان',
    tagline: 'لتحفيظ القرآن الكريم — مسجد بئر السبع',
    fallbackLabel: 'إذا لم يعمل الزر، انسخ هذا الرابط والصقه في المتصفح:',
  },
  en: {
    dir: 'ltr',
    align: 'left',
    appName: 'Al-Itqan School',
    tagline: 'Quran Memorization — Bir Saba‘ Mosque',
    fallbackLabel:
      "If the button doesn't work, copy this link into your browser:",
  },
} as const satisfies Record<MailLocale, unknown>;

export function renderMailHtml(
  content: MailContent,
  locale: MailLocale,
  logoSrc: string,
): string {
  const { dir, align, appName, tagline, fallbackLabel } = CHROME[locale];
  const link = escapeHtml(content.ctaUrl);

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.background};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};font-family:${FONT_STACK};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${BRAND.card};border:1px solid ${BRAND.cardBorder};border-radius:16px;overflow:hidden;">
<tr><td style="height:5px;line-height:5px;font-size:0;background-color:${BRAND.primary};">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;">
<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(appName)}" width="92" height="92" style="display:block;width:92px;height:92px;border:0;outline:none;text-decoration:none;">
</td></tr>
<tr><td style="padding:12px 32px 0;text-align:${align};">
<h1 style="margin:0 0 10px;font-family:${FONT_STACK};font-size:22px;line-height:1.45;font-weight:700;color:${BRAND.onSurface};">${escapeHtml(content.title)}</h1>
<p style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:1.8;color:${BRAND.onSurfaceVariant};">${escapeHtml(content.intro)}</p>
</td></tr>
<tr><td align="center" style="padding:26px 32px 4px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="${BRAND.primary}" style="border-radius:10px;">
<a href="${link}" style="display:inline-block;padding:13px 32px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(content.ctaLabel)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px 0;text-align:${align};">
<p style="margin:0;padding:11px 14px;background-color:${BRAND.primarySoft};border-radius:10px;font-family:${FONT_STACK};font-size:13px;line-height:1.7;color:${BRAND.primaryDeep};">${escapeHtml(content.notice)}</p>
</td></tr>
<tr><td style="padding:18px 32px 0;text-align:${align};">
<p style="margin:0 0 6px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.outline};">${escapeHtml(fallbackLabel)}</p>
<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;word-break:break-all;" dir="ltr"><a href="${link}" style="color:${BRAND.primary};text-decoration:underline;">${link}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 26px;">
<div style="height:1px;line-height:1px;font-size:0;background-color:${BRAND.cardBorder};">&nbsp;</div>
<p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${BRAND.outline};text-align:${align};">${escapeHtml(content.footerNote)}</p>
<p style="margin:8px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${BRAND.secondary};text-align:${align};">${escapeHtml(appName)} — ${escapeHtml(tagline)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderMailText(
  content: MailContent,
  locale: MailLocale,
): string {
  const { appName, tagline } = CHROME[locale];
  return [
    content.title,
    content.intro,
    `${content.ctaLabel}: ${content.ctaUrl}`,
    content.notice,
    content.footerNote,
    `${appName} — ${tagline}`,
  ].join('\n\n');
}

/**
 * The logo travels with the message as an inline attachment so it renders even
 * in clients that block remote images. If the asset is missing from the build,
 * fall back to the copy the web app serves rather than failing to send.
 */
export function mailLogo(appUrl: string): {
  src: string;
  attachments: Attachment[];
} {
  const content = loadLogo();
  if (!content)
    return { src: `${appUrl}/images/logo/halaqa_logo.png`, attachments: [] };
  return {
    src: `cid:${LOGO_CID}`,
    attachments: [
      {
        filename: LOGO_FILENAME,
        content,
        cid: LOGO_CID,
        contentType: 'image/png',
      },
    ],
  };
}

let cachedLogo: Buffer | null | undefined;

function loadLogo(): Buffer | null {
  if (cachedLogo === undefined) {
    try {
      cachedLogo = readFileSync(LOGO_PATH);
    } catch {
      cachedLogo = null;
    }
  }
  return cachedLogo;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
