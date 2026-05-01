import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  actor: AuthenticatedUser | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  description?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  /**
   * Best-effort audit write. A persistence failure here must never break the
   * user-facing request, so we swallow + log instead of letting the error
   * propagate up through the interceptor pipeline.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      const row = this.logs.create();
      row.actorUserId = entry.actor?.id ?? null;
      row.actorRole = entry.actor?.roles?.[0]?.slug ?? null;
      row.schoolId = entry.actor?.schoolId ?? null;
      row.action = entry.action;
      row.entityType = entry.entityType;
      row.entityId =
        entry.entityId !== undefined && entry.entityId !== null
          ? String(entry.entityId)
          : null;
      row.oldValues = entry.oldValues ?? null;
      row.newValues = entry.newValues ?? null;
      row.ipAddress = entry.ip ?? null;
      row.userAgent = entry.userAgent ?? null;
      row.description = entry.description ?? null;
      await this.logs.save(row);
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for action=${entry.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
