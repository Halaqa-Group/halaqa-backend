import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AssignTeacherDto } from '../dto/assign-teacher.dto';
import { EndAssignmentDto } from '../dto/end-assignment.dto';
import type { TeacherAssignmentResponse } from '../dto/halaqa.responses';
import { UpdateTeacherAssignmentDto } from '../dto/update-teacher-assignment.dto';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { ScheduleConflictService } from './schedule-conflict.service';

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
    @InjectRepository(HalaqaTeacher) private readonly repo: Repository<HalaqaTeacher>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly conflictChecker: ScheduleConflictService,
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

  private async loadRow(assignmentId: number, halaqaId: number): Promise<AssignmentRow> {
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

  // ─── Public methods ────────────────────────────────────────────────────────

  async assign(
    halaqaId: number,
    dto: AssignTeacherDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);
    await this.halaqatService.verifyUserRoleInSchool(dto.teacher_user_id, actor.schoolId, 'teacher');

    const existing = await this.repo.findOne({
      where: { halaqaId, teacherUserId: dto.teacher_user_id, endDate: IsNull() },
    });
    if (existing) {
      throw new ConflictException('Teacher already has an active assignment in this halaqa.');
    }

    const conflicts = await this.conflictChecker.checkForTeacher(
      dto.teacher_user_id,
      halaqaId,
      actor.schoolId,
    );
    if (conflicts.length > 0) {
      const c = conflicts[0];
      throw new ConflictException(
        `Schedule conflict with halaqa '${c.conflicting_halaqa_name}' on day ${c.day_of_week} (${c.prayer_slot}).`,
      );
    }

    const saved = await this.repo.save(
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

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: 'teacher_assigned',
      actorUserId: actor.id,
      targetUserId: dto.teacher_user_id,
    });

    return this.toResponse(await this.loadRow(saved.id, halaqaId));
  }

  async findAll(halaqaId: number, actor: AuthenticatedUser): Promise<TeacherAssignmentResponse[]> {
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

    const assignment = await this.repo.findOne({ where: { id: assignmentId, halaqaId } });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.endDate !== null) {
      throw new ConflictException('Cannot update an ended assignment.');
    }
    if (assignment.role === 'substitute') {
      throw new ConflictException(
        "Cannot change the role of a substitute — use the acting-substitute lifecycle instead.",
      );
    }

    const roleChanged = dto.role !== undefined && dto.role !== assignment.role;
    if (dto.role !== undefined) assignment.role = dto.role;
    if (dto.notes !== undefined) assignment.notes = dto.notes ?? null;

    await this.repo.save(assignment);

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

    const assignment = await this.repo.findOne({ where: { id: assignmentId, halaqaId } });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.endDate !== null) {
      throw new ConflictException('Assignment is already ended.');
    }
    if (dto.end_date < assignment.startDate) {
      throw new BadRequestException('end_date cannot be before the assignment start_date.');
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
