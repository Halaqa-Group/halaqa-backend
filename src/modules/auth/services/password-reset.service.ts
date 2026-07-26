import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, IsNull, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { generateRawToken, hashToken } from '../token-crypto';
import { MAIL_SERVICE } from './mail.service';
import type { MailService } from './mail.service';
import { TokenService } from './token.service';

const RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_OR_EXPIRED = 'Invalid or expired token';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly config: ConfigService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    @InjectRepository(PasswordResetToken)
    private readonly resets: Repository<PasswordResetToken>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async requestReset(email: string, ip: string): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { email, schoolId: this.defaultSchoolId() },
    });
    if (!user) return;

    const raw = generateRawToken();
    await this.resets.insert({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      requestedIp: ip,
    });

    const link = `${this.appUrl()}/auth/reset-password?token=${raw}`;
    // Non-null by construction: the row was looked up by this exact address.
    await this.mail.sendResetEmail(email, link);
  }

  async validateResetToken(rawToken: string): Promise<{ email: string }> {
    const row = await this.resets.findOne({
      where: { tokenHash: hashToken(rawToken) },
      relations: { user: true },
    });
    if (
      !row ||
      row.usedAt !== null ||
      row.expiresAt <= new Date() ||
      row.user.email === null
    ) {
      throw new BadRequestException(INVALID_OR_EXPIRED);
    }
    return { email: row.user.email };
  }

  async consumeResetToken(dto: ResetPasswordDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());

    const userId = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PasswordResetToken);
      const row = await repo.findOne({
        where: { tokenHash: hashToken(dto.token), usedAt: IsNull() },
      });
      if (!row || row.expiresAt <= new Date()) {
        throw new BadRequestException(INVALID_OR_EXPIRED);
      }

      await this.users.setPasswordAndBumpVersion(
        row.userId,
        passwordHash,
        manager,
      );
      await repo.update(row.id, { usedAt: new Date() });
      return row.userId;
    });

    await this.tokens.revokeAllForUser(userId, 'password_change');
  }

  private appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL');
  }

  private defaultSchoolId(): number {
    return this.config.getOrThrow<number>('DEFAULT_SCHOOL_ID');
  }

  private bcryptRounds(): number {
    return this.config.getOrThrow<number>('BCRYPT_ROUNDS');
  }
}
