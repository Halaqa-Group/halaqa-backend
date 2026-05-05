import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailService {
  sendResetEmail(to: string, link: string): Promise<void>;
  sendParentInvite(to: string, link: string): Promise<void>;
}

@Injectable()
export class NodemailerMailService
  implements MailService, OnApplicationBootstrap
{
  private readonly logger = new Logger(NodemailerMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly hasSmtp: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.hasSmtp = !!host;
    this.from = config.getOrThrow<string>('MAIL_FROM');
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

  async sendResetEmail(to: string, link: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Reset your password',
      text: `Use this link to reset your password (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
      html:
        `<p>Use this link to reset your password (valid for 1 hour):</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>If you didn't request this, ignore this email.</p>`,
    });
    if (!this.hasSmtp) {
      this.logger.log(`reset email (jsonTransport) → ${to}: ${link}`);
    }
  }

  async sendParentInvite(to: string, link: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'You have been added as a guardian',
      text: `You have been added as a parent/guardian. Set your password using this link (valid for 7 days):\n\n${link}`,
      html:
        `<p>You have been added as a parent/guardian.</p>` +
        `<p>Set your password using this link (valid for 7 days):</p>` +
        `<p><a href="${link}">${link}</a></p>`,
    });
    if (!this.hasSmtp) {
      this.logger.log(`parent invite (jsonTransport) → ${to}: ${link}`);
    }
  }
}

export const MAIL_SERVICE = Symbol('MailService');
