import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { CookieOptions, Response } from 'express';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { RefreshToken, RevokedReason } from '../entities/refresh-token.entity';
import { RequestContext } from '../request-context';
import { generateRawToken, hashToken } from '../token-crypto';

export const REFRESH_COOKIE_NAME = 'refresh_token';
const COOKIE_PATH = '/auth';

export interface IssuedRefresh {
  raw: string;
  row: RefreshToken;
}

export interface RotationResult extends IssuedRefresh {
  oldRow: RefreshToken;
}

export interface AccessTokenPayload {
  sub: number;
  school_id: number;
  tv: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  async issueRefreshToken(
    userId: number,
    ctx: RequestContext,
  ): Promise<IssuedRefresh> {
    const raw = generateRawToken();
    const row = this.refreshRepo.create({
      userId,
      tokenHash: hashToken(raw),
      familyId: crypto.randomUUID(),
      parentId: null,
      deviceName: ctx.deviceName,
      deviceType: ctx.deviceType,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ip,
      expiresAt: this.refreshExpiry(),
    });
    await this.refreshRepo.save(row);
    return { raw, row };
  }

  async rotateRefreshToken(
    rawToken: string,
    ctx: RequestContext,
  ): Promise<RotationResult> {
    const old = await this.refreshRepo.findOne({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!old) throw new UnauthorizedException();

    // Theft detection must persist outside the rotation transaction below —
    // otherwise the throw would roll back the family revocation.
    if (old.revokedAt !== null) {
      await this.refreshRepo.update(
        { familyId: old.familyId },
        { revokedAt: new Date(), revokedReason: 'suspicious_activity' },
      );
      throw new UnauthorizedException();
    }

    if (old.expiresAt <= new Date()) {
      await this.refreshRepo.update(old.id, {
        revokedAt: new Date(),
        revokedReason: 'expired',
      });
      throw new UnauthorizedException();
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshToken);
      const raw = generateRawToken();
      const newRow = repo.create({
        userId: old.userId,
        tokenHash: hashToken(raw),
        familyId: old.familyId,
        parentId: old.id,
        deviceName: ctx.deviceName ?? old.deviceName,
        deviceType: ctx.deviceType ?? old.deviceType,
        userAgent: ctx.userAgent ?? old.userAgent,
        ipAddress: ctx.ip ?? old.ipAddress,
        expiresAt: this.refreshExpiry(),
      });
      await repo.save(newRow);

      await repo.update(old.id, {
        revokedAt: new Date(),
        revokedReason: 'rotation',
        replacedById: newRow.id,
        lastUsedAt: new Date(),
      });

      return { raw, row: newRow, oldRow: old };
    });
  }

  async revokeOne(rawToken: string, reason: RevokedReason): Promise<void> {
    await this.refreshRepo.update(
      { tokenHash: hashToken(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async revokeById(
    id: string,
    userId: number,
    reason: RevokedReason,
  ): Promise<boolean> {
    const result = await this.refreshRepo.update(
      { id, userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
    return (result.affected ?? 0) > 0;
  }

  async revokeAllForUser(userId: number, reason: RevokedReason): Promise<void> {
    await this.refreshRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date(), revokedReason: reason },
    );
  }

  async listActiveForUser(userId: number): Promise<RefreshToken[]> {
    return this.refreshRepo.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { issuedAt: 'DESC' },
    });
  }

  setRefreshCookie(res: Response, raw: string): void {
    res.cookie(REFRESH_COOKIE_NAME, raw, this.cookieOptions());
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: COOKIE_PATH });
  }

  hashRaw(raw: string): string {
    return hashToken(raw);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE', false),
      sameSite: 'strict',
      path: COOKIE_PATH,
      maxAge: this.refreshTtlMs(),
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlMs());
  }

  private refreshTtlMs(): number {
    const days = this.config.get<number>('JWT_REFRESH_TTL_DAYS', 30);
    return days * 24 * 60 * 60 * 1000;
  }
}
