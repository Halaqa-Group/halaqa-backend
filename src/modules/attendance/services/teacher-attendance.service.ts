import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { AttendanceStatus } from '../entities/student-attendance.entity';
import { TeacherAttendance } from '../entities/teacher-attendance.entity';

export interface SyncTeacherEntry {
  userId: number;
  date: string;
  status: AttendanceStatus;
  excuseNote?: string | null;
  clientUuid?: string | null;
  clientRecordedAt?: string | null;
  deviceId?: string | null;
}

export type SyncOutcome = 'created' | 'updated' | 'duplicate' | 'forbidden';

export interface TeacherSyncResultRow {
  userId: number;
  date: string;
  clientUuid: string | null;
  outcome: SyncOutcome;
  attendanceId: number | null;
}

export interface TeacherBulkSyncResult {
  created: number;
  updated: number;
  duplicate: number;
  forbidden: number;
  results: TeacherSyncResultRow[];
}

export interface CorrectTeacherInput {
  status: AttendanceStatus;
  excuseNote?: string | null;
  modificationReason: string;
}

export interface ListTeacherAttendanceFilter {
  userId?: number;
  date?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
}

export interface TeacherAttendanceListResult {
  items: TeacherAttendance[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TeacherAttendanceService {
  constructor(
    @InjectRepository(TeacherAttendance)
    private readonly repo: Repository<TeacherAttendance>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /** Staff-attendance recording is principal/VP only; the accessible set is
   * every non-deleted user in the actor's school. */
  private async accessibleUserIds(
    userIds: number[],
    actor: AuthenticatedUser,
  ): Promise<Set<number>> {
    if (userIds.length === 0 || !this.isAdmin(actor)) return new Set();
    const unique = [...new Set(userIds)];
    const ph = unique.map(() => '?').join(', ');
    const rows: { id: number }[] = await this.dataSource.manager.query(
      `SELECT id FROM users WHERE id IN (${ph}) AND school_id = ? AND deleted_at IS NULL`,
      [...unique, actor.schoolId],
    );
    return new Set(rows.map((r) => r.id));
  }

  // ─── Bulk sync ──────────────────────────────────────────────────────────────

  async bulkSync(
    entries: SyncTeacherEntry[],
    actor: AuthenticatedUser,
  ): Promise<TeacherBulkSyncResult> {
    if (!this.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only principal or vice_principal can record staff attendance.',
      );
    }

    const accessible = await this.accessibleUserIds(
      entries.map((e) => e.userId),
      actor,
    );

    const results: TeacherSyncResultRow[] = [];
    for (const entry of entries) {
      const base = {
        userId: entry.userId,
        date: entry.date,
        clientUuid: entry.clientUuid ?? null,
      };
      if (!accessible.has(entry.userId)) {
        results.push({ ...base, outcome: 'forbidden', attendanceId: null });
        continue;
      }
      const outcome = await this.applyEntry(entry, actor);
      results.push({ ...base, ...outcome });
    }

    return {
      created: results.filter((r) => r.outcome === 'created').length,
      updated: results.filter((r) => r.outcome === 'updated').length,
      duplicate: results.filter((r) => r.outcome === 'duplicate').length,
      forbidden: results.filter((r) => r.outcome === 'forbidden').length,
      results,
    };
  }

  private async applyEntry(
    entry: SyncTeacherEntry,
    actor: AuthenticatedUser,
  ): Promise<{ outcome: SyncOutcome; attendanceId: number | null }> {
    if (entry.clientUuid) {
      const seen = await this.repo.findOne({
        where: { clientUuid: entry.clientUuid },
        select: { id: true },
      });
      if (seen) return { outcome: 'duplicate', attendanceId: seen.id };
    }

    const existing = await this.repo.findOne({
      where: { userId: entry.userId, attendanceDate: entry.date },
    });
    const clientRecordedAt = entry.clientRecordedAt
      ? new Date(entry.clientRecordedAt)
      : null;

    if (existing) {
      const previousStatus = existing.status;
      const changed = previousStatus !== entry.status;
      existing.status = entry.status;
      existing.excuseNote = entry.excuseNote ?? null;
      existing.clientUuid = entry.clientUuid ?? existing.clientUuid;
      existing.clientRecordedAt = clientRecordedAt ?? existing.clientRecordedAt;
      existing.deviceId = entry.deviceId ?? existing.deviceId;
      existing.modifiedBy = actor.id;
      existing.modifiedAt = new Date();
      if (changed && existing.originalStatus === null) {
        existing.originalStatus = previousStatus;
      }
      await this.repo.save(existing);

      await this.auditService.log({
        actor,
        action: 'teacher_attendance.sync_update',
        entityType: 'teacher_attendance',
        entityId: existing.id,
        oldValues: { status: previousStatus },
        newValues: { status: entry.status, via: 'bulk_sync' },
      });
      return { outcome: 'updated', attendanceId: existing.id };
    }

    const row = this.repo.create({
      schoolId: actor.schoolId,
      userId: entry.userId,
      attendanceDate: entry.date,
      status: entry.status,
      excuseNote: entry.excuseNote ?? null,
      recordedBy: actor.id,
      clientUuid: entry.clientUuid ?? null,
      clientRecordedAt,
      deviceId: entry.deviceId ?? null,
    });
    await this.repo.save(row);

    await this.auditService.log({
      actor,
      action: 'teacher_attendance.sync_create',
      entityType: 'teacher_attendance',
      entityId: row.id,
      newValues: {
        status: row.status,
        date: row.attendanceDate,
        via: 'bulk_sync',
      },
    });
    return { outcome: 'created', attendanceId: row.id };
  }

  // ─── Correction ─────────────────────────────────────────────────────────────

  async correct(
    id: number,
    input: CorrectTeacherInput,
    actor: AuthenticatedUser,
  ): Promise<TeacherAttendance> {
    if (!this.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only principal or vice_principal can correct staff attendance.',
      );
    }
    const row = await this.repo.findOne({
      where: { id, schoolId: actor.schoolId },
    });
    if (!row) throw new NotFoundException();

    const previousStatus = row.status;
    if (previousStatus === input.status) {
      throw new BadRequestException('Attendance already has this status.');
    }

    row.status = input.status;
    row.excuseNote = input.excuseNote ?? row.excuseNote;
    row.modifiedBy = actor.id;
    row.modifiedAt = new Date();
    row.modificationReason = input.modificationReason;
    if (row.originalStatus === null) row.originalStatus = previousStatus;
    await this.repo.save(row);

    await this.auditService.log({
      actor,
      action: 'teacher_attendance.correct',
      entityType: 'teacher_attendance',
      entityId: row.id,
      oldValues: { status: previousStatus },
      newValues: { status: input.status, reason: input.modificationReason },
    });

    return row;
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  async list(
    filter: ListTeacherAttendanceFilter,
    actor: AuthenticatedUser,
  ): Promise<TeacherAttendanceListResult> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.schoolId = :schoolId', { schoolId: actor.schoolId });

    if (this.isAdmin(actor)) {
      // full school visibility
    } else {
      // Any other staff role can only see their own attendance.
      qb.andWhere('a.userId = :selfId', { selfId: actor.id });
    }

    if (filter.userId !== undefined)
      qb.andWhere('a.userId = :userId', { userId: filter.userId });
    if (filter.date !== undefined)
      qb.andWhere('a.attendanceDate = :date', { date: filter.date });
    if (filter.from !== undefined)
      qb.andWhere('a.attendanceDate >= :from', { from: filter.from });
    if (filter.to !== undefined)
      qb.andWhere('a.attendanceDate <= :to', { to: filter.to });
    if (filter.status !== undefined)
      qb.andWhere('a.status = :status', { status: filter.status });

    qb.orderBy('a.attendanceDate', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
