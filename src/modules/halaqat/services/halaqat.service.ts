import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateHalaqaDto } from '../dto/create-halaqa.dto';
import type {
  HalaqaCreatedResponse,
  HalaqaDetailResponse,
  HalaqaListData,
  PrimaryTeacherSummary,
  SupervisorSummaryResponse,
  TeacherAssignmentResponse,
} from '../dto/halaqa.responses';
import { ListHalaqatQuery } from '../dto/list-halaqat.query';
import { UpdateHalaqaDto } from '../dto/update-halaqa.dto';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { Halaqa } from '../entities/halaqa.entity';
import { SupervisorHalaqa } from '../entities/supervisor-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';

@Injectable()
export class HalaqatService {
  constructor(
    @InjectRepository(Halaqa) private readonly halaqat: Repository<Halaqa>,
    @InjectRepository(SupervisorHalaqa)
    private readonly supervisorRepo: Repository<SupervisorHalaqa>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activityLog: HalaqaActivityLogService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /** Verify that userId exists in the school and holds the given role slug. */
  async verifyUserRoleInSchool(
    userId: number,
    schoolId: number,
    roleSlug: 'teacher' | 'supervisor',
  ): Promise<void> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r       ON r.id       = ur.role_id
       WHERE u.id = ? AND u.school_id = ? AND r.slug = ?
       LIMIT 1`,
      [userId, schoolId, roleSlug],
    );
    if (rows.length === 0) {
      throw new NotFoundException(
        `User ${userId} not found in this school or does not have the '${roleSlug}' role.`,
      );
    }
  }

  /**
   * Load a halaqa by id+school and verify the actor has any read relationship with it.
   * Throws NotFoundException (never ForbiddenException) per BR-HLQ-01.
   */
  async loadAndCheckAccess(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<Halaqa> {
    const halaqa = await this.halaqat.findOne({
      where: { id, schoolId: actor.schoolId },
      withDeleted: true,
    });
    if (!halaqa) throw new NotFoundException();

    if (this.isAdmin(actor)) return halaqa;

    if (actor.roles.some((r) => r.slug === 'supervisor')) {
      const row = await this.supervisorRepo.findOne({
        where: { halaqaId: id, supervisorUserId: actor.id },
      });
      if (row) return halaqa;
    }

    if (actor.roles.some((r) => r.slug === 'teacher')) {
      const rows: unknown[] = await this.dataSource.manager.query(
        `SELECT 1 FROM halaqa_teachers
         WHERE halaqa_id = ? AND teacher_user_id = ? AND end_date IS NULL LIMIT 1`,
        [id, actor.id],
      );
      if (rows.length) return halaqa;
    }

    throw new NotFoundException();
  }

  private async batchLoadPrimaryTeachers(
    halaqaIds: number[],
  ): Promise<Map<number, PrimaryTeacherSummary>> {
    if (!halaqaIds.length) return new Map();
    const ph = halaqaIds.map(() => '?').join(', ');
    type Row = {
      halaqa_id: number;
      teacher_user_id: number;
      teacher_name: string;
      is_acting: number;
    };
    const rows: Row[] = await this.dataSource.manager.query(
      `SELECT ht.halaqa_id, ht.teacher_user_id, u.name AS teacher_name,
              ht.acting_as_primary AS is_acting
       FROM halaqa_teachers ht
       JOIN users u ON u.id = ht.teacher_user_id
       WHERE ht.halaqa_id IN (${ph})
         AND ht.end_date IS NULL
         AND (ht.role = 'main' OR ht.acting_as_primary = 1)
       ORDER BY ht.acting_as_primary DESC`,
      halaqaIds,
    );
    const map = new Map<number, PrimaryTeacherSummary>();
    for (const row of rows) {
      // First row wins (acting=1 ordered first, so acting teacher is preferred)
      if (!map.has(row.halaqa_id)) {
        map.set(row.halaqa_id, {
          user_id: row.teacher_user_id,
          name: row.teacher_name,
          is_acting: Boolean(row.is_acting),
        });
      }
    }
    return map;
  }

  private async batchLoadStudentCounts(
    halaqaIds: number[],
  ): Promise<Map<number, number>> {
    if (!halaqaIds.length) return new Map();
    const ph = halaqaIds.map(() => '?').join(', ');
    type Row = { halaqa_id: number; cnt: string };
    const rows: Row[] = await this.dataSource.manager.query(
      `SELECT halaqa_id, COUNT(*) AS cnt
       FROM student_halaqa
       WHERE halaqa_id IN (${ph}) AND status = 'active'
       GROUP BY halaqa_id`,
      halaqaIds,
    );
    const map = new Map<number, number>();
    for (const row of rows) map.set(row.halaqa_id, Number(row.cnt));
    return map;
  }

  /** Load detail data (teachers, supervisors, students_count) for one halaqa. */
  private async loadDetailData(
    halaqaId: number,
    em?: EntityManager,
  ): Promise<{
    teachers: TeacherAssignmentResponse[];
    supervisors: SupervisorSummaryResponse[];
    studentsCount: number;
  }> {
    const runner = em ?? this.dataSource.manager;

    type TeacherRow = {
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
    const teacherRows: TeacherRow[] = await runner.query(
      `SELECT ht.id, ht.teacher_user_id, u.name AS teacher_name,
              ht.role, ht.acting_as_primary,
              ht.acting_starts_at, ht.acting_ends_at,
              ht.start_date, ht.end_date, ht.end_reason
       FROM halaqa_teachers ht
       JOIN users u ON u.id = ht.teacher_user_id
       WHERE ht.halaqa_id = ? AND ht.end_date IS NULL`,
      [halaqaId],
    );

    type SupervisorRow = { user_id: number; name: string; assigned_at: Date };
    const supervisorRows: SupervisorRow[] = await runner.query(
      `SELECT sh.supervisor_user_id AS user_id, u.name, sh.assigned_at
       FROM supervisor_halaqat sh
       JOIN users u ON u.id = sh.supervisor_user_id
       WHERE sh.halaqa_id = ?`,
      [halaqaId],
    );

    const countRow: { cnt: string }[] = await runner.query(
      `SELECT COUNT(*) AS cnt FROM student_halaqa WHERE halaqa_id = ? AND status = 'active'`,
      [halaqaId],
    );

    return {
      teachers: teacherRows.map((t) => ({
        id: t.id,
        teacher_user_id: t.teacher_user_id,
        teacher_name: t.teacher_name,
        role: t.role as TeacherAssignmentResponse['role'],
        acting_as_primary: Boolean(t.acting_as_primary),
        acting_starts_at: t.acting_starts_at,
        acting_ends_at: t.acting_ends_at,
        start_date: t.start_date,
        end_date: t.end_date,
        end_reason: t.end_reason as TeacherAssignmentResponse['end_reason'],
      })),
      supervisors: supervisorRows.map((s) => ({
        user_id: s.user_id,
        name: s.name,
        assigned_at: s.assigned_at,
      })),
      studentsCount: Number(countRow[0]?.cnt ?? 0),
    };
  }

  private toDetailResponse(
    halaqa: Halaqa,
    detail: Awaited<ReturnType<HalaqatService['loadDetailData']>>,
  ): HalaqaDetailResponse {
    return {
      id: halaqa.id,
      school_id: halaqa.schoolId,
      name: halaqa.name,
      type: halaqa.type,
      evaluation_settings: halaqa.evaluationSettings,
      status: halaqa.status,
      teachers: detail.teachers,
      supervisors: detail.supervisors,
      students_count: detail.studentsCount,
      created_at: halaqa.createdAt,
      updated_at: halaqa.updatedAt,
    };
  }

  // ─── Public service methods ────────────────────────────────────────────────

  async create(
    dto: CreateHalaqaDto,
    actor: AuthenticatedUser,
  ): Promise<HalaqaCreatedResponse> {
    if (dto.primary_teacher_user_id !== undefined) {
      await this.verifyUserRoleInSchool(
        dto.primary_teacher_user_id,
        actor.schoolId,
        'teacher',
      );
    }

    return this.dataSource.transaction(async (em) => {
      const halaqa = await em.getRepository(Halaqa).save(
        em.getRepository(Halaqa).create({
          schoolId: actor.schoolId,
          name: dto.name,
          type: dto.type,
          evaluationSettings: dto.evaluation_settings ?? null,
          status: 'active',
        }),
      );

      if (dto.primary_teacher_user_id !== undefined) {
        await em.getRepository(HalaqaTeacher).save(
          em.getRepository(HalaqaTeacher).create({
            halaqaId: halaqa.id,
            teacherUserId: dto.primary_teacher_user_id,
            role: 'main',
            actingAsPrimary: false,
            startDate: this.today(),
            assignedBy: actor.id,
          }),
        );
      }

      await this.activityLog.log(
        {
          schoolId: actor.schoolId,
          halaqaId: halaqa.id,
          action: 'halaqa_created',
          actorUserId: actor.id,
        },
        em,
      );

      return {
        id: halaqa.id,
        school_id: halaqa.schoolId,
        name: halaqa.name,
        type: halaqa.type,
        evaluation_settings: halaqa.evaluationSettings,
        status: halaqa.status,
        created_at: halaqa.createdAt,
      };
    });
  }

  async findAll(
    query: ListHalaqatQuery,
    actor: AuthenticatedUser,
  ): Promise<HalaqaListData> {
    const isSupervisor = actor.roles.some((r) => r.slug === 'supervisor');
    const isTeacher = actor.roles.some((r) => r.slug === 'teacher');

    // Parents are excluded at the controller level via @Roles
    if (!this.isAdmin(actor) && !isSupervisor && !isTeacher) {
      throw new ForbiddenException();
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.halaqat
      .createQueryBuilder('h')
      .where('h.schoolId = :schoolId', { schoolId: actor.schoolId })
      .withDeleted();

    if (isSupervisor && !this.isAdmin(actor)) {
      qb.innerJoin(
        'supervisor_halaqat',
        'sh_scope',
        'sh_scope.halaqa_id = h.id AND sh_scope.supervisor_user_id = :actorId',
        { actorId: actor.id },
      );
    } else if (isTeacher && !this.isAdmin(actor)) {
      qb.innerJoin(
        'halaqa_teachers',
        'ht_scope',
        'ht_scope.halaqa_id = h.id AND ht_scope.teacher_user_id = :actorId AND ht_scope.end_date IS NULL',
        { actorId: actor.id },
      );
    }

    if (query.type) qb.andWhere('h.type = :type', { type: query.type });
    if (query.status)
      qb.andWhere('h.status = :status', { status: query.status });
    if (query.search)
      qb.andWhere('h.name LIKE :search', { search: `%${query.search}%` });

    if (query.supervisor_user_id) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM supervisor_halaqat sh2 WHERE sh2.halaqa_id = h.id AND sh2.supervisor_user_id = :svId)',
        { svId: query.supervisor_user_id },
      );
    }
    if (query.teacher_user_id) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM halaqa_teachers ht2 WHERE ht2.halaqa_id = h.id AND ht2.teacher_user_id = :tId AND ht2.end_date IS NULL)',
        { tId: query.teacher_user_id },
      );
    }

    const [halaqat, total] = await qb
      .orderBy('h.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const ids = halaqat.map((h) => h.id);
    const [primaryMap, countMap] = await Promise.all([
      this.batchLoadPrimaryTeachers(ids),
      this.batchLoadStudentCounts(ids),
    ]);

    return {
      items: halaqat.map((h) => ({
        id: h.id,
        school_id: h.schoolId,
        name: h.name,
        type: h.type,
        status: h.status,
        primary_teacher: primaryMap.get(h.id) ?? null,
        students_count: countMap.get(h.id) ?? 0,
        created_at: h.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<HalaqaDetailResponse> {
    const halaqa = await this.loadAndCheckAccess(id, actor);
    const detail = await this.loadDetailData(halaqa.id);
    return this.toDetailResponse(halaqa, detail);
  }

  async update(
    id: number,
    dto: UpdateHalaqaDto,
    actor: AuthenticatedUser,
  ): Promise<HalaqaDetailResponse> {
    const halaqa = await this.loadAndCheckAccess(id, actor);

    // type change requires admin
    if ('type' in dto && !this.isAdmin(actor)) {
      throw new ForbiddenException(
        'Only principal or vice_principal can change the halaqa type.',
      );
    }

    if (dto.type && dto.type !== halaqa.type) {
      // Check BR-HLQ-03 retroactively: any active student in this halaqa already
      // enrolled in another halaqa of the NEW type?
      const rows: { cnt: string }[] = await this.dataSource.manager.query(
        `SELECT COUNT(*) AS cnt
         FROM student_halaqa sh1
         JOIN student_halaqa sh2
           ON sh2.student_id = sh1.student_id
          AND sh2.halaqa_id != sh1.halaqa_id
          AND sh2.status = 'active'
         JOIN halaqat h2 ON h2.id = sh2.halaqa_id AND h2.type = ? AND h2.school_id = ?
         WHERE sh1.halaqa_id = ? AND sh1.status = 'active'`,
        [dto.type, actor.schoolId, id],
      );
      if (Number(rows[0].cnt) > 0) {
        throw new ConflictException(
          `Cannot change type to '${dto.type}': active students are already enrolled in another '${dto.type}' halaqa.`,
        );
      }
    }

    const changes: Record<string, unknown> = {};
    if (dto.name !== undefined) changes['name'] = dto.name;
    if (dto.type !== undefined) changes['type'] = dto.type;
    if ('evaluation_settings' in dto)
      changes['evaluationSettings'] = dto.evaluation_settings ?? null;

    if (Object.keys(changes).length > 0) {
      await this.halaqat.update(id, changes);
      await this.activityLog.log({
        schoolId: actor.schoolId,
        halaqaId: id,
        action: 'halaqa_updated',
        actorUserId: actor.id,
        metadata: changes,
      });
    }

    const updated = await this.halaqat.findOneOrFail({
      where: { id },
      withDeleted: true,
    });
    const detail = await this.loadDetailData(id);
    return this.toDetailResponse(updated, detail);
  }

  async archive(id: number, actor: AuthenticatedUser): Promise<ApiMessage> {
    const halaqa = await this.halaqat.findOne({
      where: { id, schoolId: actor.schoolId },
      withDeleted: true,
    });
    if (!halaqa) throw new NotFoundException();
    if (halaqa.status === 'archived')
      throw new ConflictException('Halaqa is already archived.');

    // BR-HLQ-10: cannot archive with active students
    const countRow: { cnt: string }[] = await this.dataSource.manager.query(
      `SELECT COUNT(*) AS cnt FROM student_halaqa WHERE halaqa_id = ? AND status = 'active'`,
      [id],
    );
    const activeCount = Number(countRow[0].cnt);
    if (activeCount > 0) {
      throw new ConflictException(
        `Cannot archive halaqa: it has ${activeCount} active student(s). Transfer or remove them first.`,
      );
    }

    const today = this.today();
    const archiveNote = `Halaqa archived on ${today}`;

    await this.dataSource.transaction(async (em) => {
      await em.query(
        `UPDATE halaqat SET status = 'archived', deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
        [id],
      );
      await em.query(
        `UPDATE halaqa_teachers
         SET end_date = ?, end_reason = 'other',
             notes = CASE WHEN notes IS NULL THEN ? ELSE CONCAT(notes, ' | ', ?) END
         WHERE halaqa_id = ? AND end_date IS NULL`,
        [today, archiveNote, archiveNote, id],
      );
      await em.query(
        `UPDATE student_halaqa SET status = 'archived' WHERE halaqa_id = ? AND status = 'active'`,
        [id],
      );
      await this.activityLog.log(
        {
          schoolId: actor.schoolId,
          halaqaId: id,
          action: 'halaqa_archived',
          actorUserId: actor.id,
        },
        em,
      );
    });

    return new ApiMessage('Halaqa archived.');
  }

  async complete(id: number, actor: AuthenticatedUser): Promise<ApiMessage> {
    const halaqa = await this.halaqat.findOne({
      where: { id, schoolId: actor.schoolId },
    });
    if (!halaqa) throw new NotFoundException();
    if (halaqa.status !== 'active') {
      throw new ConflictException(
        `Cannot complete a halaqa with status '${halaqa.status}'.`,
      );
    }

    const today = this.today();
    const completeNote = `Halaqa completed on ${today}`;

    await this.dataSource.transaction(async (em) => {
      await em.query(`UPDATE halaqat SET status = 'completed' WHERE id = ?`, [
        id,
      ]);
      await em.query(
        `UPDATE halaqa_teachers
         SET end_date = ?, end_reason = 'other',
             notes = CASE WHEN notes IS NULL THEN ? ELSE CONCAT(notes, ' | ', ?) END
         WHERE halaqa_id = ? AND end_date IS NULL`,
        [today, completeNote, completeNote, id],
      );
      await em.query(
        `UPDATE student_halaqa SET status = 'completed' WHERE halaqa_id = ? AND status = 'active'`,
        [id],
      );
      await this.activityLog.log(
        {
          schoolId: actor.schoolId,
          halaqaId: id,
          action: 'halaqa_completed',
          actorUserId: actor.id,
        },
        em,
      );
    });

    return new ApiMessage('Halaqa marked as completed.');
  }

  async restore(id: number, actor: AuthenticatedUser): Promise<ApiMessage> {
    const halaqa = await this.halaqat.findOne({
      where: { id, schoolId: actor.schoolId, status: 'archived' },
      withDeleted: true,
    });
    if (!halaqa)
      throw new NotFoundException('Halaqa not found or is not archived.');

    await this.dataSource.transaction(async (em) => {
      await em.query(
        `UPDATE halaqat SET status = 'active', deleted_at = NULL WHERE id = ?`,
        [id],
      );
      await this.activityLog.log(
        {
          schoolId: actor.schoolId,
          halaqaId: id,
          action: 'halaqa_restored',
          actorUserId: actor.id,
        },
        em,
      );
    });

    return new ApiMessage('Halaqa restored.');
  }
}
