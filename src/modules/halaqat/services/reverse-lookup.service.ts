import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type {
  StudentHalaqaItem,
  SupervisorHalaqaItem,
  TeacherHalaqaItem,
} from '../dto/halaqa.responses';

@Injectable()
export class ReverseLookupService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  private assertSelfOrAdmin(
    targetUserId: number,
    actor: AuthenticatedUser,
  ): void {
    if (!this.isAdmin(actor) && actor.id !== targetUserId) {
      throw new ForbiddenException('You can only look up your own halaqat.');
    }
  }

  async teacherHalaqat(
    userId: number,
    actor: AuthenticatedUser,
  ): Promise<TeacherHalaqaItem[]> {
    this.assertSelfOrAdmin(userId, actor);

    const rows: Array<{
      halaqa_id: number;
      halaqa_name: string;
      halaqa_status: string;
      halaqa_type: string;
      role: string;
      start_date: string;
    }> = await this.dataSource.manager.query(
      `SELECT ht.halaqa_id, h.name AS halaqa_name, h.status AS halaqa_status,
              h.type AS halaqa_type, ht.role, ht.start_date
       FROM halaqa_teachers ht
       JOIN halaqat h ON h.id = ht.halaqa_id
       WHERE ht.teacher_user_id = ? AND h.school_id = ? AND ht.end_date IS NULL
       ORDER BY h.name ASC`,
      [userId, actor.schoolId],
    );

    if (!this.isAdmin(actor) && rows.length === 0) {
      await this.verifyUserInSchool(userId, actor.schoolId);
    }

    return rows.map((r) => ({
      halaqa_id: r.halaqa_id,
      halaqa_name: r.halaqa_name,
      halaqa_status: r.halaqa_status as TeacherHalaqaItem['halaqa_status'],
      halaqa_type: r.halaqa_type as TeacherHalaqaItem['halaqa_type'],
      role: r.role as TeacherHalaqaItem['role'],
      start_date: r.start_date,
    }));
  }

  async supervisorHalaqat(
    userId: number,
    actor: AuthenticatedUser,
  ): Promise<SupervisorHalaqaItem[]> {
    this.assertSelfOrAdmin(userId, actor);

    const rows: Array<{
      halaqa_id: number;
      halaqa_name: string;
      halaqa_status: string;
      halaqa_type: string;
      assigned_at: Date;
    }> = await this.dataSource.manager.query(
      `SELECT sh.halaqa_id, h.name AS halaqa_name, h.status AS halaqa_status,
              h.type AS halaqa_type, sh.assigned_at
       FROM supervisor_halaqat sh
       JOIN halaqat h ON h.id = sh.halaqa_id
       WHERE sh.supervisor_user_id = ? AND h.school_id = ?
       ORDER BY h.name ASC`,
      [userId, actor.schoolId],
    );

    if (!this.isAdmin(actor) && rows.length === 0) {
      await this.verifyUserInSchool(userId, actor.schoolId);
    }

    return rows.map((r) => ({
      halaqa_id: r.halaqa_id,
      halaqa_name: r.halaqa_name,
      halaqa_status: r.halaqa_status as SupervisorHalaqaItem['halaqa_status'],
      halaqa_type: r.halaqa_type as SupervisorHalaqaItem['halaqa_type'],
      assigned_at: r.assigned_at,
    }));
  }

  async studentHalaqat(
    studentId: number,
    actor: AuthenticatedUser,
  ): Promise<StudentHalaqaItem[]> {
    const rows: Array<{
      halaqa_id: number;
      halaqa_name: string;
      halaqa_status: string;
      halaqa_type: string;
      enrollment_date: string;
      enrollment_status: string;
    }> = await this.dataSource.manager.query(
      `SELECT sh.halaqa_id, h.name AS halaqa_name, h.status AS halaqa_status,
              h.type AS halaqa_type, sh.enrollment_date, sh.status AS enrollment_status
       FROM student_halaqa sh
       JOIN halaqat h ON h.id = sh.halaqa_id
       JOIN students s ON s.id = sh.student_id
       WHERE sh.student_id = ? AND s.school_id = ? AND h.school_id = ?
       ORDER BY sh.enrollment_date DESC`,
      [studentId, actor.schoolId, actor.schoolId],
    );

    if (rows.length === 0) {
      await this.verifyStudentInSchool(studentId, actor.schoolId);
    }

    return rows.map((r) => ({
      halaqa_id: r.halaqa_id,
      halaqa_name: r.halaqa_name,
      halaqa_status: r.halaqa_status as StudentHalaqaItem['halaqa_status'],
      halaqa_type: r.halaqa_type as StudentHalaqaItem['halaqa_type'],
      enrollment_date: r.enrollment_date,
      enrollment_status:
        r.enrollment_status as StudentHalaqaItem['enrollment_status'],
    }));
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async verifyUserInSchool(
    userId: number,
    schoolId: number,
  ): Promise<void> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM users WHERE id = ? AND school_id = ? LIMIT 1`,
      [userId, schoolId],
    );
    if (!rows.length)
      throw new NotFoundException(`User ${userId} not found in this school.`);
  }

  private async verifyStudentInSchool(
    studentId: number,
    schoolId: number,
  ): Promise<void> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      [studentId, schoolId],
    );
    if (!rows.length)
      throw new NotFoundException(
        `Student ${studentId} not found in this school.`,
      );
  }
}
