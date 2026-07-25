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
import { EnrollStudentDto } from '../dto/enroll-student.dto';
import type { StudentEnrollmentResponse } from '../dto/halaqa.responses';
import { RemoveStudentDto } from '../dto/remove-student.dto';
import { TransferStudentDto } from '../dto/transfer-student.dto';
import type { EnrollmentStatus } from '../entities/student-halaqa-enrollment.entity';
import { StudentHalaqaEnrollment } from '../entities/student-halaqa-enrollment.entity';
import { StudentHalaqa } from '../entities/student-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';

type EnrollmentRow = {
  student_id: number;
  student_name: string;
  enrollment_date: string;
  status: string;
};

@Injectable()
export class StudentEnrollmentService {
  constructor(
    @InjectRepository(StudentHalaqa)
    private readonly repo: Repository<StudentHalaqa>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly activityLog: HalaqaActivityLogService,
    @InjectRepository(StudentHalaqaEnrollment)
    private readonly enrollments: Repository<StudentHalaqaEnrollment>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  protected today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Historical-membership dual-write (§8): opens a new open interval in
   * `student_halaqa_enrollments` alongside the `student_halaqa` current-state row.
   */
  private async openEnrollmentInterval(
    studentId: number,
    halaqaId: number,
    startDate: string,
    actorId: number,
  ): Promise<void> {
    await this.enrollments.save(
      this.enrollments.create({
        studentId,
        halaqaId,
        startDate,
        endDate: null,
        status: 'active',
        createdBy: actorId,
      }),
    );
  }

  /** Closes the currently-open interval (if any) with an end date + outcome. */
  private async closeEnrollmentInterval(
    studentId: number,
    halaqaId: number,
    endDate: string,
    status: EnrollmentStatus,
    reason: string | null,
  ): Promise<void> {
    const open = await this.enrollments.findOne({
      where: { studentId, halaqaId, endDate: IsNull() },
      order: { startDate: 'DESC' },
    });
    if (!open) return;
    open.endDate = endDate;
    open.status = status;
    open.endReason = reason;
    await this.enrollments.save(open);
  }

  private toResponse(row: EnrollmentRow): StudentEnrollmentResponse {
    return {
      student_id: row.student_id,
      student_name: row.student_name,
      enrollment_date: row.enrollment_date,
      status: row.status as StudentEnrollmentResponse['status'],
    };
  }

  private async loadRow(
    studentId: number,
    halaqaId: number,
  ): Promise<StudentEnrollmentResponse> {
    const rows: EnrollmentRow[] = await this.dataSource.manager.query(
      `SELECT sh.student_id, s.name AS student_name, sh.enrollment_date, sh.status
       FROM student_halaqa sh
       JOIN students s ON s.id = sh.student_id
       WHERE sh.student_id = ? AND sh.halaqa_id = ?`,
      [studentId, halaqaId],
    );
    if (!rows.length) throw new NotFoundException('Enrollment not found.');
    return this.toResponse(rows[0]);
  }

  private async verifyStudentInSchool(
    studentId: number,
    schoolId: number,
  ): Promise<void> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      [studentId, schoolId],
    );
    if (!rows.length) {
      throw new NotFoundException(
        `Student ${studentId} not found in this school.`,
      );
    }
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async enroll(
    halaqaId: number,
    dto: EnrollStudentDto,
    actor: AuthenticatedUser,
  ): Promise<StudentEnrollmentResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(
      halaqaId,
      actor,
    );
    if (halaqa.status !== 'active') {
      throw new ConflictException(
        'Cannot enroll students in an archived or completed halaqa.',
      );
    }

    await this.verifyStudentInSchool(dto.student_id, actor.schoolId);

    const existing = await this.repo.findOne({
      where: { halaqaId, studentId: dto.student_id },
    });
    if (existing?.status === 'active') {
      throw new ConflictException(
        'Student is already actively enrolled in this halaqa.',
      );
    }

    const enrollmentDate = dto.enrollment_date ?? this.today();
    const isReEnroll = !!existing;

    await this.repo.save(
      this.repo.create({
        studentId: dto.student_id,
        halaqaId,
        enrollmentDate,
        status: 'active',
      }),
    );
    await this.openEnrollmentInterval(
      dto.student_id,
      halaqaId,
      enrollmentDate,
      actor.id,
    );

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: isReEnroll ? 'student_re_enrolled' : 'student_enrolled',
      actorUserId: actor.id,
      targetStudentId: dto.student_id,
    });

    return this.loadRow(dto.student_id, halaqaId);
  }

  async listStudents(
    halaqaId: number,
    actor: AuthenticatedUser,
  ): Promise<StudentEnrollmentResponse[]> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const rows: EnrollmentRow[] = await this.dataSource.manager.query(
      `SELECT sh.student_id, s.name AS student_name, sh.enrollment_date, sh.status
       FROM student_halaqa sh
       JOIN students s ON s.id = sh.student_id
       WHERE sh.halaqa_id = ? AND sh.status = 'active'
       ORDER BY s.name ASC`,
      [halaqaId],
    );
    return rows.map((r) => this.toResponse(r));
  }

  async removeStudent(
    halaqaId: number,
    studentId: number,
    dto: RemoveStudentDto,
    actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(
      halaqaId,
      actor,
    );
    if (halaqa.status !== 'active') {
      throw new ConflictException(
        'Cannot modify enrollment in an archived or completed halaqa.',
      );
    }

    const enrollment = await this.repo.findOne({
      where: { halaqaId, studentId, status: 'active' },
    });
    if (!enrollment)
      throw new NotFoundException(
        'Student is not actively enrolled in this halaqa.',
      );

    enrollment.status = dto.outcome === 'completed' ? 'completed' : 'archived';
    await this.repo.save(enrollment);
    await this.closeEnrollmentInterval(
      studentId,
      halaqaId,
      this.today(),
      enrollment.status,
      dto.notes ?? null,
    );

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action:
        dto.outcome === 'completed'
          ? 'student_completed'
          : 'student_unenrolled',
      actorUserId: actor.id,
      targetStudentId: studentId,
      notes: dto.notes ?? null,
    });

    return {
      message:
        dto.outcome === 'completed'
          ? 'Student marked as completed.'
          : 'Student unenrolled.',
    };
  }

  async transferStudent(
    dto: TransferStudentDto,
    actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    if (dto.from_halaqa_id === dto.to_halaqa_id) {
      throw new BadRequestException(
        'from_halaqa_id and to_halaqa_id must differ.',
      );
    }

    const fromHalaqa = await this.halaqatService.loadAndCheckAccess(
      dto.from_halaqa_id,
      actor,
    );
    if (fromHalaqa.status !== 'active') {
      throw new ConflictException('Source halaqa is not active.');
    }

    const toHalaqa = await this.halaqatService.loadAndCheckAccess(
      dto.to_halaqa_id,
      actor,
    );
    if (toHalaqa.status !== 'active') {
      throw new ConflictException('Destination halaqa is not active.');
    }

    const fromEnrollment = await this.repo.findOne({
      where: {
        halaqaId: dto.from_halaqa_id,
        studentId: dto.student_id,
        status: 'active',
      },
    });
    if (!fromEnrollment) {
      throw new NotFoundException(
        'Student is not actively enrolled in the source halaqa.',
      );
    }

    const toEnrollment = await this.repo.findOne({
      where: {
        halaqaId: dto.to_halaqa_id,
        studentId: dto.student_id,
        status: 'active',
      },
    });
    if (toEnrollment) {
      throw new ConflictException(
        'Student is already actively enrolled in the destination halaqa.',
      );
    }

    const transferDate = dto.transfer_date ?? this.today();

    fromEnrollment.status = 'transferred';
    await this.repo.save(fromEnrollment);
    await this.closeEnrollmentInterval(
      dto.student_id,
      dto.from_halaqa_id,
      transferDate,
      'transferred',
      dto.reason ?? null,
    );

    await this.repo.save(
      this.repo.create({
        studentId: dto.student_id,
        halaqaId: dto.to_halaqa_id,
        enrollmentDate: transferDate,
        status: 'active',
      }),
    );
    await this.openEnrollmentInterval(
      dto.student_id,
      dto.to_halaqa_id,
      transferDate,
      actor.id,
    );

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId: dto.from_halaqa_id,
      action: 'student_transferred_out',
      actorUserId: actor.id,
      targetStudentId: dto.student_id,
      fromHalaqaId: dto.from_halaqa_id,
      toHalaqaId: dto.to_halaqa_id,
      notes: dto.reason,
    });

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId: dto.to_halaqa_id,
      action: 'student_transferred_in',
      actorUserId: actor.id,
      targetStudentId: dto.student_id,
      fromHalaqaId: dto.from_halaqa_id,
      toHalaqaId: dto.to_halaqa_id,
      notes: dto.reason,
    });

    return { message: 'Student transferred successfully.' };
  }
}
