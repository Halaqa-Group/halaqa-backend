import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Halaqa } from '../entities/halaqa.entity';

// ─── Decorator ────────────────────────────────────────────────────────────────

export type HalaqaPermissionLevel = 'read' | 'write';
export const HALAQA_PERMISSION_KEY = 'halaqaPermission';
export const RequiresHalaqaPermission = (level: HalaqaPermissionLevel) =>
  SetMetadata(HALAQA_PERMISSION_KEY, level);

// ─── Shared scope check ───────────────────────────────────────────────────────

async function checkScope(
  ctx: ExecutionContext,
  dataSource: DataSource,
  withDeleted: boolean,
): Promise<boolean> {
  const req = ctx
    .switchToHttp()
    .getRequest<AuthenticatedRequest & { halaqa?: Halaqa }>();
  const actor: AuthenticatedUser = req.user;
  const halaqaId = Number(req.params['id']);

  if (!halaqaId) return true;

  const halaqa = await dataSource.manager.findOne(Halaqa, {
    where: { id: halaqaId, schoolId: actor.schoolId },
    withDeleted,
  });
  if (!halaqa) throw new NotFoundException();

  const slugs = actor.roles.map((r) => r.slug);

  if (slugs.includes('principal') || slugs.includes('vice_principal')) {
    req.halaqa = halaqa;
    return true;
  }

  if (slugs.includes('supervisor')) {
    const rows: unknown[] = await dataSource.manager.query(
      `SELECT 1 FROM supervisor_halaqat
       WHERE halaqa_id = ? AND supervisor_user_id = ? LIMIT 1`,
      [halaqaId, actor.id],
    );
    if (rows.length) {
      req.halaqa = halaqa;
      return true;
    }
  }

  if (slugs.includes('teacher')) {
    const rows: unknown[] = await dataSource.manager.query(
      `SELECT 1 FROM halaqa_teachers
       WHERE halaqa_id = ? AND teacher_user_id = ? AND end_date IS NULL LIMIT 1`,
      [halaqaId, actor.id],
    );
    if (rows.length) {
      req.halaqa = halaqa;
      return true;
    }
  }

  throw new NotFoundException(); // BR-HLQ-01: never expose 403
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Read-level scope guard. Loads the halaqa with withDeleted:true so archived
 * halaqat remain readable (e.g. for historical detail views).
 */
@Injectable()
export class HalaqaAccessGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> {
    return checkScope(ctx, this.dataSource, true);
  }
}

/**
 * Write-level scope guard. Loads the halaqa with withDeleted:false, so
 * archived/completed halaqat return 404 — you cannot edit what is no longer
 * active.
 */
@Injectable()
export class HalaqaEditAccessGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  canActivate(ctx: ExecutionContext): Promise<boolean> {
    return checkScope(ctx, this.dataSource, false);
  }
}
