import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AuthenticatedRequest } from '../../../common/types/authenticated-request';
import { Student } from '../entities/student.entity';

@Injectable()
export class StudentScopeGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { student?: Student }>();
    const actor: AuthenticatedUser = req.user;
    const studentId = Number(req.params['id']);

    if (!studentId) return true;

    const student = await this.dataSource.manager.findOne(Student, {
      where: { id: studentId },
      withDeleted: true,
    });

    if (!student || student.schoolId !== actor.schoolId) {
      throw new NotFoundException();
    }

    const roles = actor.roles.map((r) => r.slug);

    if (roles.includes('principal') || roles.includes('vice_principal')) {
      req.student = student;
      return true;
    }

    const inScope = await this.checkScope(studentId, actor, roles);
    if (!inScope) throw new NotFoundException();

    req.student = student;
    return true;
  }

  private async checkScope(
    studentId: number,
    actor: AuthenticatedUser,
    roles: string[],
  ): Promise<boolean> {
    const em = this.dataSource.manager;

    if (roles.includes('supervisor')) {
      const rows = await em.query(
        `SELECT 1 FROM supervisor_halaqat sup
         JOIN student_halaqa sh ON sh.halaqa_id = sup.halaqa_id
         WHERE sup.supervisor_user_id = ? AND sh.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    if (roles.includes('teacher')) {
      const rows = await em.query(
        `SELECT 1 FROM halaqa_teachers ht
         JOIN student_halaqa sh ON sh.halaqa_id = ht.halaqa_id
         WHERE ht.teacher_user_id = ? AND ht.end_date IS NULL AND sh.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    if (roles.includes('parent')) {
      const rows = await em.query(
        `SELECT 1 FROM student_guardians sg
         WHERE sg.guardian_user_id = ? AND sg.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    return false;
  }
}
