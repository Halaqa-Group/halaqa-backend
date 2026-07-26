import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { MailContent } from '../mail/mail-layout';
import { mailLogo, renderMailHtml, renderMailText } from '../mail/mail-layout';
import type { MailLocale } from '../mail/mail-locale';
import {
  parentInviteEmail,
  passwordResetEmail,
  verificationEmail,
} from '../mail/mail-templates';

export interface MailService {
  sendResetEmail(to: string, link: string, locale: MailLocale): Promise<void>;
  sendParentInvite(to: string, link: string, locale: MailLocale): Promise<void>;
  sendVerificationEmail(
    to: string,
    link: string,
    locale: MailLocale,
  ): Promise<void>;
}

@Injectable()
export class NodemailerMailService
  implements MailService, OnApplicationBootstrap
{
  private readonly logger = new Logger(NodemailerMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly hasSmtp: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.hasSmtp = !!host;
    this.from = config.getOrThrow<string>('MAIL_FROM');
    this.appUrl = config.getOrThrow<string>('APP_URL');
    this.transporter = this.hasSmtp
      ? nodemailer.createTransport({
          host,
          port: config.get<number>('SMTP_PORT', 587),
          auth: {
            user: config.get<string>('SMTP_USER'),
            pass: config.get<string>('SMTP_PASS'),
          },
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.hasSmtp) {
      this.logger.warn(
        'SMTP_HOST is unset — MailService is using jsonTransport (emails are logged, not sent).',
      );
      return;
    }
    await this.transporter.verify();
    this.logger.log('SMTP transport verified');
  }

  async sendResetEmail(
    to: string,
    link: string,
    locale: MailLocale,
  ): Promise<void> {
    await this.deliver(to, passwordResetEmail(locale, link), locale);
  }

  async sendVerificationEmail(
    to: string,
    link: string,
    locale: MailLocale,
  ): Promise<void> {
    await this.deliver(to, verificationEmail(locale, link), locale);
  }

  async sendParentInvite(
    to: string,
    link: string,
    locale: MailLocale,
  ): Promise<void> {
    await this.deliver(to, parentInviteEmail(locale, link), locale);
  }

  private async deliver(
    to: string,
    content: MailContent,
    locale: MailLocale,
  ): Promise<void> {
    const logo = mailLogo(this.appUrl);
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: content.subject,
      text: renderMailText(content, locale),
      html: renderMailHtml(content, locale, logo.src),
      attachments: logo.attachments,
    });
    if (!this.hasSmtp) {
      this.logger.log(
        `${content.kind} (jsonTransport, ${locale}) → ${to}: ${content.ctaUrl}`,
      );
    }
  }
}

export const MAIL_SERVICE = Symbol('MailService');
