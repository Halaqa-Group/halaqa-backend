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
import {
  AttendanceStatus,
  StudentAttendance,
} from '../entities/student-attendance.entity';

export interface SyncAttendanceEntry {
  studentId: number;
  date: string;
  status: AttendanceStatus;
  excuseNote?: string | null;
  clientUuid?: string | null;
  clientRecordedAt?: string | null;
  deviceId?: string | null;
}

export type SyncOutcome = 'created' | 'updated' | 'duplicate' | 'forbidden';

export interface SyncResultRow {
  studentId: number;
  date: string;
  clientUuid: string | null;
  outcome: SyncOutcome;
  attendanceId: number | null;
}

export interface BulkSyncResult {
  created: number;
  updated: number;
  duplicate: number;
  forbidden: number;
  results: SyncResultRow[];
}

export interface CorrectAttendanceInput {
  status: AttendanceStatus;
  excuseNote?: string | null;
  modificationReason: string;
}

export interface ListStudentAttendanceFilter {
  studentId?: number;
  date?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
}

export interface StudentAttendanceListResult {
  items: StudentAttendance[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class StudentAttendanceService {
  constructor(
    @InjectRepository(StudentAttendance)
    private readonly repo: Repository<StudentAttendance>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // ─── Role helpers ───────────────────────────────────────────────────────────

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  private hasRole(actor: AuthenticatedUser, slug: string): boolean {
    return actor.roles.some((r) => r.slug === slug);
  }

  /**
   * From a set of candidate student ids, return the subset the actor may
   * record/correct attendance for. Admins reach every student in their school;
   * teachers reach students actively enrolled in a halaqa they teach.
   * Supervisors and parents cannot record (empty set).
   */
  private async accessibleStudentIds(
    studentIds: number[],
    actor: AuthenticatedUser,
  ): Promise<Set<number>> {
    if (studentIds.length === 0) return new Set();
    const unique = [...new Set(studentIds)];
    const ph = unique.map(() => '?').join(', ');

    if (this.isAdmin(actor)) {
      const rows: { id: number }[] = await this.dataSource.manager.query(
        `SELECT id FROM students WHERE id IN (${ph}) AND school_id = ? AND deleted_at IS NULL`,
        [...unique, actor.schoolId],
      );
      return new Set(rows.map((r) => r.id));
    }

    if (this.hasRole(actor, 'teacher')) {
      const rows: { student_id: number }[] =
        await this.dataSource.manager.query(
          `SELECT DISTINCT sh.student_id
         FROM student_halaqa sh
         JOIN halaqa_teachers ht
           ON ht.halaqa_id = sh.halaqa_id AND ht.end_date IS NULL
         JOIN students s ON s.id = sh.student_id
         WHERE sh.student_id IN (${ph})
           AND sh.status = 'active'
           AND ht.teacher_user_id = ?
           AND s.school_id = ?
           AND s.deleted_at IS NULL`,
          [...unique, actor.id, actor.schoolId],
        );
      return new Set(rows.map((r) => r.student_id));
    }

    return new Set();
  }

  // ─── Bulk offline sync ──────────────────────────────────────────────────────

  /**
   * Idempotent batch upload from an offline device. Each entry is deduped by
   * `client_uuid` (re-syncing the same batch is a no-op), then applied to the
   * (student, date) row: a seeded/existing row is corrected, otherwise a new
   * row is inserted. Rows the actor lacks scope over are rejected individually
   * (`forbidden`) so the rest of the batch still lands.
   */
  async bulkSync(
    entries: SyncAttendanceEntry[],
    actor: AuthenticatedUser,
  ): Promise<BulkSyncResult> {
    if (!this.isAdmin(actor) && !this.hasRole(actor, 'teacher')) {
      throw new ForbiddenException('You cannot record attendance.');
    }

    const accessible = await this.accessibleStudentIds(
      entries.map((e) => e.studentId),
      actor,
    );

    const results: SyncResultRow[] = [];
    for (const entry of entries) {
      const base = {
        studentId: entry.studentId,
        date: entry.date,
        clientUuid: entry.clientUuid ?? null,
      };

      if (!accessible.has(entry.studentId)) {
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
    entry: SyncAttendanceEntry,
    actor: AuthenticatedUser,
  ): Promise<{ outcome: SyncOutcome; attendanceId: number | null }> {
    // Idempotency: a row already carrying this client_uuid means the batch was
    // seen before — leave it untouched.
    if (entry.clientUuid) {
      const seen = await this.repo.findOne({
        where: { clientUuid: entry.clientUuid },
        select: { id: true },
      });
      if (seen) return { outcome: 'duplicate', attendanceId: seen.id };
    }

    const existing = await this.repo.findOne({
      where: { studentId: entry.studentId, attendanceDate: entry.date },
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
      // Capture the pre-human value once (usually the seeded 'present').
      if (changed && existing.originalStatus === null) {
        existing.originalStatus = previousStatus;
      }
      await this.repo.save(existing);

      await this.auditService.log({
        actor,
        action: 'student_attendance.sync_update',
        entityType: 'student_attendance',
        entityId: existing.id,
        oldValues: { status: previousStatus },
        newValues: { status: entry.status, via: 'bulk_sync' },
      });

      return { outcome: 'updated', attendanceId: existing.id };
    }

    const row = this.repo.create({
      schoolId: actor.schoolId,
      studentId: entry.studentId,
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
      action: 'student_attendance.sync_create',
      entityType: 'student_attendance',
      entityId: row.id,
      newValues: {
        status: row.status,
        date: row.attendanceDate,
        via: 'bulk_sync',
      },
    });

    return { outcome: 'created', attendanceId: row.id };
  }

  // ─── Single correction ──────────────────────────────────────────────────────

  async correct(
    id: number,
    input: CorrectAttendanceInput,
    actor: AuthenticatedUser,
  ): Promise<StudentAttendance> {
    const row = await this.repo.findOne({
      where: { id, schoolId: actor.schoolId },
    });
    if (!row) throw new NotFoundException();

    const accessible = await this.accessibleStudentIds([row.studentId], actor);
    if (!accessible.has(row.studentId)) {
      // No record authority over this student → 404, not 403 (no existence leak).
      throw new NotFoundException();
    }

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
      action: 'student_attendance.correct',
      entityType: 'student_attendance',
      entityId: row.id,
      oldValues: { status: previousStatus },
      newValues: { status: input.status, reason: input.modificationReason },
    });

    return row;
  }

  // ─── List ───────────────────────────────────────────────────────────────────

  async list(
    filter: ListStudentAttendanceFilter,
    actor: AuthenticatedUser,
  ): Promise<StudentAttendanceListResult> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.schoolId = :schoolId', { schoolId: actor.schoolId });

    if (this.isAdmin(actor)) {
      // full school visibility
    } else if (this.hasRole(actor, 'supervisor')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM student_halaqa sh
          JOIN supervisor_halaqat sup
            ON sup.halaqa_id = sh.halaqa_id AND sup.supervisor_user_id = :actorId
          WHERE sh.student_id = a.studentId AND sh.status = 'active'
        )`,
        { actorId: actor.id },
      );
    } else if (this.hasRole(actor, 'teacher')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM student_halaqa sh
          JOIN halaqa_teachers ht
            ON ht.halaqa_id = sh.halaqa_id AND ht.end_date IS NULL
          WHERE sh.student_id = a.studentId AND sh.status = 'active'
            AND ht.teacher_user_id = :actorId
        )`,
        { actorId: actor.id },
      );
    } else if (this.hasRole(actor, 'parent')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM student_guardians sg
          WHERE sg.student_id = a.studentId AND sg.guardian_user_id = :actorId
        )`,
        { actorId: actor.id },
      );
    } else {
      // No recognised role → nothing visible.
      qb.andWhere('1 = 0');
    }

    if (filter.studentId !== undefined) {
      qb.andWhere('a.studentId = :studentId', { studentId: filter.studentId });
    }
    if (filter.date !== undefined) {
      qb.andWhere('a.attendanceDate = :date', { date: filter.date });
    }
    if (filter.from !== undefined) {
      qb.andWhere('a.attendanceDate >= :from', { from: filter.from });
    }
    if (filter.to !== undefined) {
      qb.andWhere('a.attendanceDate <= :to', { to: filter.to });
    }
    if (filter.status !== undefined) {
      qb.andWhere('a.status = :status', { status: filter.status });
    }

    qb.orderBy('a.attendanceDate', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
