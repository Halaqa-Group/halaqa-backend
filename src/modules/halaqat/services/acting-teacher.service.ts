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
import { ActingSubstituteDto } from '../dto/acting-substitute.dto';
import { ExtendActingDto } from '../dto/extend-acting.dto';
import type { TeacherAssignmentResponse } from '../dto/halaqa.responses';
import { SetActingDto } from '../dto/set-acting.dto';
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
export class ActingTeacherService {
  constructor(
    @InjectRepository(HalaqaTeacher) private readonly repo: Repository<HalaqaTeacher>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly activityLog: HalaqaActivityLogService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  protected today(): string {
    return new Date().toISOString().slice(0, 10);
  }

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

  private async findCurrentActing(halaqaId: number): Promise<HalaqaTeacher | null> {
    return this.repo.findOne({
      where: { halaqaId, actingAsPrimary: true, endDate: IsNull() },
    });
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async setActing(
    halaqaId: number,
    assignmentId: number,
    dto: SetActingDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const assignment = await this.repo.findOne({ where: { id: assignmentId, halaqaId } });
    if (!assignment) throw new NotFoundException('Assignment not found.');
    if (assignment.endDate !== null) {
      throw new ConflictException('Cannot set acting on an ended assignment.');
    }
    if (assignment.actingAsPrimary) {
      throw new ConflictException('This teacher is already acting as primary.');
    }

    const today = this.today();
    if (dto.acting_starts_at < today) {
      throw new BadRequestException('acting_starts_at cannot be in the past.');
    }

    const other = await this.findCurrentActing(halaqaId);
    if (other) {
      throw new ConflictException('Another teacher is already acting as primary in this halaqa.');
    }

    assignment.actingStartsAt = dto.acting_starts_at;
    assignment.actingEndsAt = dto.acting_ends_at;
    if (dto.acting_starts_at === today) {
      assignment.actingAsPrimary = true;
    }
    if (dto.notes !== undefined) assignment.notes = dto.notes ?? null;

    await this.repo.save(assignment);

    await this.activityLog.log({
      schoolId: halaqa.schoolId,
      halaqaId,
      action: 'acting_started',
      actorUserId: actor.id,
      targetUserId: assignment.teacherUserId,
    });

    return this.toResponse(await this.loadRow(assignmentId, halaqaId));
  }

  async substitute(
    halaqaId: number,
    dto: ActingSubstituteDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(halaqaId, actor);
    await this.halaqatService.verifyUserRoleInSchool(dto.teacher_user_id, halaqa.schoolId, 'teacher');

    const today = this.today();
    if (dto.acting_starts_at > today) {
      throw new BadRequestException('Substitute acting_starts_at cannot be in the future.');
    }

    const existing = await this.repo.findOne({
      where: { halaqaId, teacherUserId: dto.teacher_user_id, endDate: IsNull() },
    });
    if (existing) {
      throw new ConflictException('Teacher already has an active assignment in this halaqa.');
    }

    const other = await this.findCurrentActing(halaqaId);
    if (other) {
      throw new ConflictException('Another teacher is already acting as primary in this halaqa.');
    }

    // BR-HLQ-08: substitute bypasses schedule conflict check
    const saved = await this.repo.save(
      this.repo.create({
        halaqaId,
        teacherUserId: dto.teacher_user_id,
        role: 'substitute',
        actingAsPrimary: true,
        actingStartsAt: dto.acting_starts_at,
        actingEndsAt: dto.acting_ends_at,
        startDate: dto.acting_starts_at,
        notes: dto.notes ?? null,
        assignedBy: actor.id,
      }),
    );

    await this.activityLog.log({
      schoolId: halaqa.schoolId,
      halaqaId,
      action: 'acting_started',
      actorUserId: actor.id,
      targetUserId: dto.teacher_user_id,
    });

    return this.toResponse(await this.loadRow(saved.id, halaqaId));
  }

  async extend(
    halaqaId: number,
    dto: ExtendActingDto,
    actor: AuthenticatedUser,
  ): Promise<TeacherAssignmentResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const acting = await this.findCurrentActing(halaqaId);
    if (!acting) throw new NotFoundException('No active acting teacher in this halaqa.');

    if (acting.actingEndsAt !== null && dto.acting_ends_at <= acting.actingEndsAt) {
      throw new BadRequestException('New acting_ends_at must be after the current acting_ends_at.');
    }

    acting.actingEndsAt = dto.acting_ends_at;
    await this.repo.save(acting);

    await this.activityLog.log({
      schoolId: halaqa.schoolId,
      halaqaId,
      action: 'acting_extended',
      actorUserId: actor.id,
      targetUserId: acting.teacherUserId,
    });

    return this.toResponse(await this.loadRow(acting.id, halaqaId));
  }

  async endActing(halaqaId: number, actor: AuthenticatedUser): Promise<ApiMessage> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const acting = await this.findCurrentActing(halaqaId);
    if (!acting) throw new NotFoundException('No active acting teacher in this halaqa.');

    acting.actingAsPrimary = false;
    acting.actingStartsAt = null;
    acting.actingEndsAt = null;

    if (acting.role === 'substitute') {
      acting.endDate = this.today();
      acting.endReason = 'reassigned';
    }

    await this.repo.save(acting);

    await this.activityLog.log({
      schoolId: halaqa.schoolId,
      halaqaId,
      action: 'acting_ended',
      actorUserId: actor.id,
      targetUserId: acting.teacherUserId,
    });

    return { message: 'Acting period ended.' };
  }
}
