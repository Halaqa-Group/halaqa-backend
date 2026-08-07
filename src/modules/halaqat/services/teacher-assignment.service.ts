import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AssignTeacherDto } from '../dto/assign-teacher.dto';
import { EndAssignmentDto } from '../dto/end-assignment.dto';
import type { TeacherAssignmentResponse } from '../dto/halaqa.responses';
import { UpdateTeacherAssignmentDto } from '../dto/update-teacher-assignment.dto';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';

type AssignmentRow = {
  id: number;
  teacher_user_id: number;
  teacher_name: string;
  role: string;
  acting_as_primary: number;
  acting_starts_at: string | null;
  acting_ends_at: string | null;
  start_date: string;
  end_date: string | null;
  end_reason: string | null;
};

@Injectable()
export class TeacherAssignmentService {
  constructor(
    @InjectRepository(HalaqaTeacher)
    private readonly repo: Repository<HalaqaTeacher>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly activityLog: HalaqaActivityLogService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toResponse(row: AssignmentRow): TeacherAssignmentResponse {
    return {
      id: row.id,
      teacher_user_id: row.teacher_user_id,
      teacher_name: row.teacher_name,
      role: row.role as TeacherAssignmentResponse['role'],
      acting_as_primary: Boolean(row.acting_as_primary),
      acting_starts_at: row.acting_starts_at,
      acting_ends_at: row.acting_ends_at,
      start_date: row.start_date,
      end_date: row.end_date,
      end_reason: row.end_reason as TeacherAssignmentResponse['end_reason'],
    };
  }

  private async loadRow(
    assignmentId: number,
    halaqaId: number,
  ): Promise<AssignmentRow> {
    const rows: AssignmentRow[] = await this.dataSource.manager.query(
      `SELECT ht.id, ht.teacher_user_id, u.name AS teacher_name,
              ht.role, ht.acting_as_primary,
              ht.acting_starts_at, ht.acting_ends_at,
              ht.start_date, ht.end_date, ht.end_reason
       FROM halaqa_teachers ht
       JOIN users u ON u.id = ht.teacher_user_id
       WHERE ht.id = ? AND ht.halaqa_id = ?`,
      [assignmentId, halaqaId],
    );
    if (!rows.length) throw new NotFoundException('Assignment not found.');
    return rows[0];
  }

  private static readonly MAIN_TEACHER_CONFLICT =
    'This halaqa already has an active main teacher. End that assignment first or assign this teacher as an assistant.';

  /**
   * BR-HLQ-04 — at most one active `role='main'` row per halaqa. The DB enforces
   * this via the unique index `idx_one_main_per_halaqa`; this check surfaces it
   * as a 409 instead of letting the driver error escape as a 500.
   */
  private async assertNoActiveMain(
    halaqaId: number,
    exceptAssignmentId?: number,
  ): Promise<void> {
    const existing = await this.repo.findOne({
      where: {
        halaqaId,
        role: 'main',
        endDate: IsNull(),
        ...(exceptAssignmentId !== undefined
          ? { id: Not(exceptAssignmentId) }
          : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        TeacherAssignmentService.MAIN_TEACHER_CONFLICT,
      );
    }
  }

  /** Safety net for the race between assertNoActiveMain and the insert/update. */
  private static isDuplicateEntry(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { driverError?: { code?: string } }).driverError
        ?.code === 'ER_DUP_ENTRY'
    );
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async assign(
    halaqaId: number,
    dto: AssignTeacherDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);
    await this.halaqatService.verifyUserRoleInSchool(
      dto.teacher_user_id,
      actor.schoolId,
      'teacher',
    );

    const existing = await this.repo.findOne({
      where: {
        halaqaId,
        teacherUserId: dto.teacher_user_id,
        endDate: IsNull(),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Teacher already has an active assignment in this halaqa.',
      );
    }

    if (dto.role === 'main') await this.assertNoActiveMain(halaqaId);

    let saved: HalaqaTeacher;
    try {
      saved = await this.repo.save(
        this.repo.create({
          halaqaId,
          teacherUserId: dto.teacher_user_id,
          role: dto.role,
          actingAsPrimary: false,
          startDate: dto.start_date,
          notes: dto.notes ?? null,
          assignedBy: actor.id,
        }),
      );
    } catch (err) {
      if (TeacherAssignmentService.isDuplicateEntry(err)) {
        throw new ConflictException(
          TeacherAssignmentService.MAIN_TEACHER_CONFLICT,
        );
      }
      throw err;
    }

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: 'teacher_assigned',
      actorUserId: actor.id,
      targetUserId: dto.teacher_user_id,
    });

    return this.toResponse(await this.loadRow(saved.id, halaqaId));
  }

  async findAll(
    halaqaId: number,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse[]> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);
    const rows: AssignmentRow[] = await this.dataSource.manager.query(
      `SELECT ht.id, ht.teacher_user_id, u.name AS teacher_name,
              ht.role, ht.acting_as_primary,
              ht.acting_starts_at, ht.acting_ends_at,
              ht.start_date, ht.end_date, ht.end_reason
       FROM halaqa_teachers ht
       JOIN users u ON u.id = ht.teacher_user_id
       WHERE ht.halaqa_id = ? AND ht.end_date IS NULL
       ORDER BY ht.acting_as_primary DESC, ht.role ASC`,
      [halaqaId],
    );
    return rows.map((r) => this.toResponse(r));
  }

  async updateAssignment(
    halaqaId: number,
    assignmentId: number,
    dto: UpdateTeacherAssignmentDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const assignment = await this.repo.findOne({
      where: { id: assignmentId, halaqaId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.endDate !== null) {
      throw new ConflictException('Cannot update an ended assignment.');
    }
    if (assignment.role === 'substitute') {
      throw new ConflictException(
        'Cannot change the role of a substitute — use the acting-substitute lifecycle instead.',
      );
    }

    const roleChanged = dto.role !== undefined && dto.role !== assignment.role;
    if (roleChanged && dto.role === 'main') {
      await this.assertNoActiveMain(halaqaId, assignmentId);
    }
    if (dto.role !== undefined) assignment.role = dto.role;
    if (dto.notes !== undefined) assignment.notes = dto.notes ?? null;

    try {
      await this.repo.save(assignment);
    } catch (err) {
      if (TeacherAssignmentService.isDuplicateEntry(err)) {
        throw new ConflictException(
          TeacherAssignmentService.MAIN_TEACHER_CONFLICT,
        );
      }
      throw err;
    }

    if (roleChanged) {
      await this.activityLog.log({
        schoolId: actor.schoolId,
        halaqaId,
        action: 'teacher_role_changed',
        actorUserId: actor.id,
        targetUserId: assignment.teacherUserId,
      });
    }

    return this.toResponse(await this.loadRow(assignmentId, halaqaId));
  }

  async endAssignment(
    halaqaId: number,
    assignmentId: number,
    dto: EndAssignmentDto,
    actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const assignment = await this.repo.findOne({
      where: { id: assignmentId, halaqaId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.endDate !== null) {
      throw new ConflictException('Assignment is already ended.');
    }
    if (dto.end_date < assignment.startDate) {
      throw new BadRequestException(
        'end_date cannot be before the assignment start_date.',
      );
    }

    assignment.endDate = dto.end_date;
    assignment.endReason = dto.end_reason;
    if (dto.notes !== undefined) assignment.notes = dto.notes ?? null;

    // Clear acting fields if this teacher was acting as primary
    if (assignment.actingAsPrimary) {
      assignment.actingAsPrimary = false;
      assignment.actingStartsAt = null;
      assignment.actingEndsAt = null;
    }

    await this.repo.save(assignment);

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: 'teacher_unassigned',
      actorUserId: actor.id,
      targetUserId: assignment.teacherUserId,
    });

    return { message: 'Assignment ended.' };
  }
}
