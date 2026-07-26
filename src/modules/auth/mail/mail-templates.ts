import type { MailContent } from './mail-layout';
import type { MailLocale } from './mail-locale';

/**
 * Copy for every transactional email, in both supported languages. The wording
 * tracks the frontend locale files (`i18n/locales/{ar,en}.json`) so an email and
 * the page it links to read the same way.
 */
type LocalizedCopy = Omit<MailContent, 'kind' | 'ctaUrl'>;

const VERIFICATION: Record<MailLocale, LocalizedCopy> = {
  ar: {
    subject: 'تأكيد بريدك الإلكتروني — مدرسة الإتقان',
    preheader: 'رابط تأكيد بريدك الإلكتروني صالح لمدة 24 ساعة.',
    title: 'أكّد بريدك الإلكتروني',
    intro:
      'مرحبًا بك في مدرسة الإتقان لتحفيظ القرآن الكريم. اضغط على الزر أدناه لتأكيد أن هذا العنوان يخصّك، حتى نتمكن من إرسال إشعارات حلقتك وتقاريرها إليك.',
    ctaLabel: 'تأكيد البريد الإلكتروني',
    notice: 'الرابط صالح لمدة 24 ساعة ويُستخدم مرة واحدة فقط.',
    footerNote: 'إذا لم تطلب هذا التأكيد، يمكنك تجاهل هذه الرسالة بأمان.',
  },
  en: {
    subject: 'Confirm your email — Al-Itqan School',
    preheader: 'Your email confirmation link is valid for 24 hours.',
    title: 'Confirm your email',
    intro:
      "Welcome to Al-Itqan School for Quran memorization. Tap the button below to confirm this address is yours, so we can send you your halaqa's notifications and reports.",
    ctaLabel: 'Confirm email',
    notice: 'This link is valid for 24 hours and can only be used once.',
    footerNote:
      "If you didn't request this confirmation, you can safely ignore this email.",
  },
};

const PASSWORD_RESET: Record<MailLocale, LocalizedCopy> = {
  ar: {
    subject: 'إعادة تعيين كلمة المرور — مدرسة الإتقان',
    preheader: 'رابط إعادة تعيين كلمة المرور صالح لمدة ساعة واحدة.',
    title: 'إعادة تعيين كلمة المرور',
    intro:
      'وصلنا طلب لإعادة تعيين كلمة مرور حسابك في مدرسة الإتقان. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.',
    ctaLabel: 'إعادة تعيين كلمة المرور',
    notice: 'الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة فقط.',
    footerNote:
      'إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة ولن يتغيّر شيء في حسابك.',
  },
  en: {
    subject: 'Reset your password — Al-Itqan School',
    preheader: 'Your password reset link is valid for one hour.',
    title: 'Reset your password',
    intro:
      'We received a request to reset the password for your Al-Itqan School account. Tap the button below to choose a new one.',
    ctaLabel: 'Reset password',
    notice: 'This link is valid for one hour and can only be used once.',
    footerNote:
      "If you didn't request a reset, ignore this email — nothing about your account will change.",
  },
};

const PARENT_INVITE: Record<MailLocale, LocalizedCopy> = {
  ar: {
    subject: 'تمت إضافتك كوليّ أمر — مدرسة الإتقان',
    preheader: 'اضبط كلمة المرور لتفعيل حسابك خلال 7 أيام.',
    title: 'تمت إضافتك كوليّ أمر',
    intro:
      'تمت إضافتك كوليّ أمر في مدرسة الإتقان، لتتابع حفظ أبنائك وحضورهم وتقاريرهم. اضبط كلمة المرور لتفعيل حسابك.',
    ctaLabel: 'تعيين كلمة المرور',
    notice: 'الرابط صالح لمدة 7 أيام ويُستخدم مرة واحدة فقط.',
    footerNote: 'إذا وصلتك هذه الرسالة بالخطأ، يمكنك تجاهلها بأمان.',
  },
  en: {
    subject: "You've been added as a guardian — Al-Itqan School",
    preheader: 'Set your password to activate your account within 7 days.',
    title: "You've been added as a guardian",
    intro:
      "You have been added as a parent/guardian at Al-Itqan School, where you can follow your children's memorization, attendance, and reports. Set a password to activate your account.",
    ctaLabel: 'Set password',
    notice: 'This link is valid for 7 days and can only be used once.',
    footerNote:
      'If you received this email by mistake, you can safely ignore it.',
  },
};

export function verificationEmail(
  locale: MailLocale,
  link: string,
): MailContent {
  return { kind: 'verification email', ...VERIFICATION[locale], ctaUrl: link };
}

export function passwordResetEmail(
  locale: MailLocale,
  link: string,
): MailContent {
  return { kind: 'reset email', ...PASSWORD_RESET[locale], ctaUrl: link };
}

export function parentInviteEmail(
  locale: MailLocale,
  link: string,
): MailContent {
  return { kind: 'parent invite', ...PARENT_INVITE[locale], ctaUrl: link };
}
