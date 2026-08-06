import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { DataWithWarnings } from '../../../common/data-with-warnings';
import {
  buildFullName,
  namePartsPatch,
  toNameFields,
} from '../../../common/person-name';
import {
  PHONE_COUNTRY_CODE_PATTERN,
  PHONE_NUMBER_PATTERN,
  normalizeCountryCode,
  normalizePhoneNumber,
  toE164,
} from '../../../common/phone';
import { AuditService } from '../../audit/audit.service';
import { StudentGuardian } from '../entities/student-guardian.entity';
import {
  CAPACITY_LIMITS,
  DEFAULT_CAPACITY_UNIT,
  type StudentCapacityUnit,
} from '../capacity.config';
import { CreateStudentDto } from '../dto/create-student.dto';
import { GraduateStudentDto } from '../dto/graduate-student.dto';
import { ListStudentsQuery } from '../dto/list-students.query';
import {
  GuardianView,
  StudentDetailView,
  StudentListResult,
  StudentView,
} from '../dto/student.responses';
import { UpdateStudentByTeacherDto } from '../dto/update-student-by-teacher.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { MemorizationDirection, Student } from '../entities/student.entity';
import { GuardiansService } from './guardians.service';
import {
  ID_NUMBER_VALIDATOR,
  type IdNumberValidator,
} from '../../../common/validators/id-number-validator.interface';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
    @InjectRepository(StudentGuardian)
    private readonly guardianRepo: Repository<StudentGuardian>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly guardians: GuardiansService,
    @Inject(ID_NUMBER_VALIDATOR)
    private readonly idValidator: IdNumberValidator,
  ) {}

  async create(
    dto: CreateStudentDto,
    actor: AuthenticatedUser,
  ): Promise<StudentDetailView | DataWithWarnings<StudentDetailView>> {
    this.validateCapacities(dto);

    let normalizedIdNumber: string | undefined;
    let idNumberWarnings: string[] = [];

    if (dto.id_number !== undefined) {
      normalizedIdNumber = this.idValidator.normalize(dto.id_number);
      const vr = this.idValidator.validate(normalizedIdNumber);
      if (!vr.ok) {
        throw new BadRequestException('id_number format is invalid.');
      }
      idNumberWarnings = vr.warnings;
      const conflict = await this.students.findOne({
        where: { idNumber: normalizedIdNumber, schoolId: actor.schoolId },
        withDeleted: true,
      });
      if (conflict) {
        throw new ConflictException('ID number already in use.');
      }
    }

    const phone = this.resolvePhone(dto, null) ?? {
      phoneCountryCode: null,
      phone: null,
    };

    const studentId = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Student);
      const student = await repo.save(
        repo.create({
          schoolId: actor.schoolId,
          firstName: dto.first_name,
          secondName: dto.second_name,
          thirdName: dto.third_name,
          familyName: dto.family_name,
          idNumber: normalizedIdNumber ?? null,
          phoneCountryCode: phone.phoneCountryCode,
          phone: phone.phone,
          gender: dto.gender,
          dob: dto.dob ? new Date(dto.dob) : null,
          joinDate: new Date(dto.join_date),
          status: dto.status ?? 'active',
          dailyHifzPagesCapacity: dto.daily_hifz_pages_capacity ?? 1,
          dailyHifzCapacityUnit:
            dto.daily_hifz_capacity_unit ?? DEFAULT_CAPACITY_UNIT,
          dailyNearPagesCapacity: dto.daily_near_pages_capacity ?? 5,
          dailyNearCapacityUnit:
            dto.daily_near_capacity_unit ?? DEFAULT_CAPACITY_UNIT,
          dailyFarPagesCapacity: dto.daily_far_pages_capacity ?? 10,
          dailyFarCapacityUnit:
            dto.daily_far_capacity_unit ?? DEFAULT_CAPACITY_UNIT,
          memorizationDirection: dto.memorization_direction ?? 'descending',
          notes: dto.notes ?? null,
          photoUrl: dto.photo_url ?? null,
        }),
      );

      if (dto.guardians?.length) {
        await this.guardians.linkMany(
          student.id,
          dto.guardians,
          actor,
          manager,
        );
      }

      return student.id;
    });

    await this.audit.log({
      actor,
      action: 'student.create',
      entityType: 'student',
      entityId: studentId,
      newValues: {
        name: buildFullName({
          firstName: dto.first_name,
          secondName: dto.second_name,
          thirdName: dto.third_name,
          familyName: dto.family_name,
        }),
        gender: dto.gender,
        status: dto.status ?? 'active',
        ...(normalizedIdNumber !== undefined && {
          id_number: normalizedIdNumber,
        }),
        ...(idNumberWarnings.length && {
          id_number_warnings: idNumberWarnings,
        }),
        ...(phone.phone && {
          phone: toE164(phone.phoneCountryCode, phone.phone),
        }),
      },
    });

    const view = await this.findOne(studentId, actor);
    if (idNumberWarnings.length > 0) {
      return new DataWithWarnings(view, idNumberWarnings);
    }
    return view;
  }

  async list(
    query: ListStudentsQuery,
    actor: AuthenticatedUser,
  ): Promise<StudentListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.students
      .createQueryBuilder('s')
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const roles = actor.roles.map((r) => r.slug);
    const isPrincipalOrVP =
      roles.includes('principal') || roles.includes('vice_principal');

    if (isPrincipalOrVP) {
      if (query.include_deleted) {
        qb.withDeleted().where('s.schoolId = :schoolId', {
          schoolId: actor.schoolId,
        });
      } else {
        qb.where('s.schoolId = :schoolId AND s.deletedAt IS NULL', {
          schoolId: actor.schoolId,
        });
      }
    } else if (roles.includes('supervisor')) {
      qb.where(
        's.schoolId = :schoolId AND s.deletedAt IS NULL AND s.id IN (' +
          'SELECT sh.student_id FROM student_halaqa sh WHERE sh.halaqa_id IN (' +
          'SELECT supl.halaqa_id FROM supervisor_halaqat supl WHERE supl.supervisor_user_id = :userId))',
        { schoolId: actor.schoolId, userId: actor.id },
      );
    } else if (roles.includes('teacher') && roles.includes('parent')) {
      qb.where(
        's.deletedAt IS NULL AND s.id IN (' +
          'SELECT sh.student_id FROM student_halaqa sh ' +
          'JOIN students st ON st.id = sh.student_id AND st.school_id = :schoolId ' +
          'WHERE sh.halaqa_id IN (' +
          'SELECT ht.halaqa_id FROM halaqa_teachers ht ' +
          'WHERE ht.teacher_user_id = :userId AND ht.end_date IS NULL) ' +
          'UNION ' +
          'SELECT sg.student_id FROM student_guardians sg WHERE sg.guardian_user_id = :userId)',
        { schoolId: actor.schoolId, userId: actor.id },
      );
    } else if (roles.includes('teacher')) {
      qb.where(
        's.schoolId = :schoolId AND s.deletedAt IS NULL AND s.id IN (' +
          'SELECT sh.student_id FROM student_halaqa sh WHERE sh.halaqa_id IN (' +
          'SELECT ht.halaqa_id FROM halaqa_teachers ht ' +
          'WHERE ht.teacher_user_id = :userId AND ht.end_date IS NULL))',
        { schoolId: actor.schoolId, userId: actor.id },
      );
    } else {
      // parent only
      qb.where(
        's.deletedAt IS NULL AND s.id IN (' +
          'SELECT sg.student_id FROM student_guardians sg WHERE sg.guardian_user_id = :userId)',
        { userId: actor.id },
      );
    }

    if (query.q) {
      const qNorm = `%${this.idValidator.normalize(query.q)}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('s.name LIKE :q', { q: `%${query.q}%` })
            .orWhere('s.idNumber LIKE :qNorm', { qNorm }),
        ),
      );
    }

    if (query.id_number !== undefined) {
      qb.andWhere('s.idNumber = :idNum', {
        idNum: this.idValidator.normalize(query.id_number),
      });
    }

    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.gender) {
      qb.andWhere('s.gender = :gender', { gender: query.gender });
    }
    if (query.halaqa_id) {
      qb.andWhere(
        's.id IN (SELECT sh2.student_id FROM student_halaqa sh2 WHERE sh2.halaqa_id = :halaqaId)',
        { halaqaId: query.halaqa_id },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((s) => this.toView(s, actor)),
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<StudentDetailView> {
    const student = await this.findInScopeOrFail(id, actor);
    const guardianLinks = await this.guardianRepo.find({
      where: { studentId: id },
      relations: { guardian: true },
      order: { createdAt: 'ASC' },
    });

    const guardians: GuardianView[] = guardianLinks.map((sg) => ({
      user: {
        id: sg.guardian.id,
        ...toNameFields(sg.guardian),
        email: sg.guardian.email,
        phone: sg.guardian.phone,
      },
      relation: sg.relation,
      is_primary: !!sg.isPrimary,
      can_pickup: !!sg.canPickup,
    }));

    return { ...this.toView(student, actor), guardians };
  }

  async findInScopeOrFail(
    id: number,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<Student> {
    const repo = manager?.getRepository(Student) ?? this.students;
    const student = await repo.findOne({ where: { id } });

    if (!student || student.schoolId !== actor.schoolId) {
      throw new NotFoundException();
    }

    const roles = actor.roles.map((r) => r.slug);
    if (roles.includes('principal') || roles.includes('vice_principal')) {
      return student;
    }

    const em = manager ?? this.dataSource.manager;
    const inScope = await this.isInScope(id, actor, roles, em);
    if (!inScope) throw new NotFoundException();

    return student;
  }

  async update(
    id: number,
    dto: UpdateStudentDto,
    actor: AuthenticatedUser,
    isTeacherOnly: boolean,
  ): Promise<StudentDetailView | DataWithWarnings<StudentDetailView>> {
    const student = await this.findInScopeOrFail(id, actor);

    if (isTeacherOnly) {
      const teacherOnlyFields = new Set([
        'daily_hifz_pages_capacity',
        'daily_hifz_capacity_unit',
        'daily_near_pages_capacity',
        'daily_near_capacity_unit',
        'daily_far_pages_capacity',
        'daily_far_capacity_unit',
        'memorization_direction',
        'notes',
      ]);
      const forbidden = Object.keys(dto as Record<string, unknown>).filter(
        (k) => !teacherOnlyFields.has(k),
      );
      if (forbidden.length > 0) {
        throw new BadRequestException(
          `property ${forbidden[0]} should not exist`,
        );
      }

      const hasPrimary = await this.teacherHasPrimaryOnStudent(actor.id, id);
      if (!hasPrimary) throw new ForbiddenException();
    }

    this.validateCapacities(dto);

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const patch: {
      firstName?: string;
      secondName?: string;
      thirdName?: string;
      familyName?: string;
      gender?: string;
      dob?: Date | null;
      joinDate?: Date;
      status?: string;
      photoUrl?: string | null;
      dailyHifzPagesCapacity?: number;
      dailyHifzCapacityUnit?: StudentCapacityUnit;
      dailyNearPagesCapacity?: number;
      dailyNearCapacityUnit?: StudentCapacityUnit;
      dailyFarPagesCapacity?: number;
      dailyFarCapacityUnit?: StudentCapacityUnit;
      memorizationDirection?: MemorizationDirection;
      notes?: string | null;
      idNumber?: string | null;
      phoneCountryCode?: string | null;
      phone?: string | null;
    } = {};

    if (!isTeacherOnly) {
      const nameParts = namePartsPatch(dto);
      const changedParts = Object.entries(nameParts).filter(
        ([key, value]) => value !== student[key as keyof typeof nameParts],
      );
      if (changedParts.length > 0) {
        // Audited as the full display name — `name` is derived, so compute the
        // post-patch value rather than reading the stale entity.
        oldValues.name = student.name;
        newValues.name = buildFullName({ ...student, ...nameParts });
        Object.assign(patch, Object.fromEntries(changedParts));
      }
      if (dto.gender !== undefined && dto.gender !== student.gender) {
        oldValues.gender = student.gender;
        newValues.gender = dto.gender;
        patch.gender = dto.gender;
      }
      if (dto.dob !== undefined) {
        const d = dto.dob ? new Date(dto.dob) : null;
        oldValues.dob = student.dob;
        newValues.dob = d;
        patch.dob = d;
      }
      if (dto.join_date !== undefined) {
        const d = new Date(dto.join_date);
        oldValues.joinDate = student.joinDate;
        newValues.joinDate = d;
        patch.joinDate = d;
      }
      if (dto.status !== undefined && dto.status !== student.status) {
        oldValues.status = student.status;
        newValues.status = dto.status;
        patch.status = dto.status;
      }
      if (dto.photo_url !== undefined) {
        oldValues.photoUrl = student.photoUrl;
        newValues.photoUrl = dto.photo_url ?? null;
        patch.photoUrl = dto.photo_url ?? null;
      }

      const phone = this.resolvePhone(dto, student);
      if (phone !== undefined) {
        // Audited as the joined number — the split is a storage detail.
        oldValues.phone = toE164(student.phoneCountryCode, student.phone);
        newValues.phone = toE164(phone.phoneCountryCode, phone.phone);
        patch.phoneCountryCode = phone.phoneCountryCode;
        patch.phone = phone.phone;
      }
    }

    if (dto.daily_hifz_pages_capacity !== undefined) {
      oldValues.dailyHifzPagesCapacity = student.dailyHifzPagesCapacity;
      newValues.dailyHifzPagesCapacity = dto.daily_hifz_pages_capacity;
      patch.dailyHifzPagesCapacity = dto.daily_hifz_pages_capacity;
    }
    if (
      dto.daily_hifz_capacity_unit !== undefined &&
      dto.daily_hifz_capacity_unit !== student.dailyHifzCapacityUnit
    ) {
      oldValues.dailyHifzCapacityUnit = student.dailyHifzCapacityUnit;
      newValues.dailyHifzCapacityUnit = dto.daily_hifz_capacity_unit;
      patch.dailyHifzCapacityUnit = dto.daily_hifz_capacity_unit;
    }
    if (dto.daily_near_pages_capacity !== undefined) {
      oldValues.dailyNearPagesCapacity = student.dailyNearPagesCapacity;
      newValues.dailyNearPagesCapacity = dto.daily_near_pages_capacity;
      patch.dailyNearPagesCapacity = dto.daily_near_pages_capacity;
    }
    if (
      dto.daily_near_capacity_unit !== undefined &&
      dto.daily_near_capacity_unit !== student.dailyNearCapacityUnit
    ) {
      oldValues.dailyNearCapacityUnit = student.dailyNearCapacityUnit;
      newValues.dailyNearCapacityUnit = dto.daily_near_capacity_unit;
      patch.dailyNearCapacityUnit = dto.daily_near_capacity_unit;
    }
    if (dto.daily_far_pages_capacity !== undefined) {
      oldValues.dailyFarPagesCapacity = student.dailyFarPagesCapacity;
      newValues.dailyFarPagesCapacity = dto.daily_far_pages_capacity;
      patch.dailyFarPagesCapacity = dto.daily_far_pages_capacity;
    }
    if (
      dto.daily_far_capacity_unit !== undefined &&
      dto.daily_far_capacity_unit !== student.dailyFarCapacityUnit
    ) {
      oldValues.dailyFarCapacityUnit = student.dailyFarCapacityUnit;
      newValues.dailyFarCapacityUnit = dto.daily_far_capacity_unit;
      patch.dailyFarCapacityUnit = dto.daily_far_capacity_unit;
    }
    if (
      dto.memorization_direction !== undefined &&
      dto.memorization_direction !== student.memorizationDirection
    ) {
      oldValues.memorizationDirection = student.memorizationDirection;
      newValues.memorizationDirection = dto.memorization_direction;
      patch.memorizationDirection = dto.memorization_direction;
    }
    if (dto.notes !== undefined) {
      oldValues.notes = student.notes;
      newValues.notes = dto.notes;
      patch.notes = dto.notes ?? null;
    }

    let idNumberWarnings: string[] = [];
    let isForceChange = false;

    if (!isTeacherOnly && dto.id_number !== undefined) {
      if (dto.id_number === null) {
        // Clearing the field
        if (student.idNumber !== null) {
          if (!dto.force_id_number_change) {
            throw new BadRequestException(
              'ID number is locked. Use force_id_number_change: true to override.',
            );
          }
          isForceChange = true;
        }
        oldValues.id_number = student.idNumber;
        newValues.id_number = null;
        patch.idNumber = null;
      } else {
        // Setting or changing
        const norm = this.idValidator.normalize(dto.id_number);
        const vr = this.idValidator.validate(norm);
        if (!vr.ok) {
          throw new BadRequestException('id_number format is invalid.');
        }
        if (student.idNumber !== null && norm !== student.idNumber) {
          if (!dto.force_id_number_change) {
            throw new BadRequestException(
              'ID number is locked. Use force_id_number_change: true to override.',
            );
          }
          isForceChange = true;
        }
        // Uniqueness check excluding the current student row
        const conflict = await this.students
          .createQueryBuilder('s')
          .where('s.idNumber = :n AND s.schoolId = :sid AND s.id != :id', {
            n: norm,
            sid: actor.schoolId,
            id,
          })
          .withDeleted()
          .getOne();
        if (conflict) {
          throw new ConflictException('ID number already in use.');
        }
        idNumberWarnings = vr.warnings;
        oldValues.id_number = student.idNumber;
        newValues.id_number = norm;
        if (vr.warnings.length) newValues.id_number_warnings = vr.warnings;
        patch.idNumber = norm;
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.students.update(
        id,
        patch as Parameters<typeof this.students.update>[1],
      );
    }

    await this.audit.log({
      actor,
      action: 'student.update',
      entityType: 'student',
      entityId: id,
      oldValues: Object.keys(oldValues).length ? oldValues : null,
      newValues: Object.keys(newValues).length ? newValues : null,
    });

    if (isForceChange) {
      await this.audit.log({
        actor,
        action: 'student.id_number.force_changed',
        entityType: 'student',
        entityId: id,
        oldValues: { id_number: student.idNumber },
        newValues: { id_number: patch.idNumber ?? null },
      });
    }

    const view = await this.findOne(id, actor);
    if (idNumberWarnings.length > 0) {
      return new DataWithWarnings(view, idNumberWarnings);
    }
    return view;
  }

  async softDelete(id: number, actor: AuthenticatedUser): Promise<void> {
    await this.findInScopeOrFail(id, actor);
    await this.students.softDelete(id);
    await this.audit.log({
      actor,
      action: 'student.delete',
      entityType: 'student',
      entityId: id,
    });
  }

  async restore(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<StudentDetailView> {
    const student = await this.students.findOne({
      where: { id, schoolId: actor.schoolId },
      withDeleted: true,
    });
    if (!student) throw new NotFoundException();
    await this.students.restore(id);
    await this.audit.log({
      actor,
      action: 'student.restore',
      entityType: 'student',
      entityId: id,
    });
    return this.findOne(id, actor);
  }

  async graduate(
    id: number,
    dto: GraduateStudentDto,
    actor: AuthenticatedUser,
  ): Promise<StudentDetailView> {
    const student = await this.findInScopeOrFail(id, actor);
    if (student.status === 'graduated') {
      throw new BadRequestException('Student is already graduated');
    }
    await this.students.update(id, { status: 'graduated' });
    await this.audit.log({
      actor,
      action: 'student.graduate',
      entityType: 'student',
      entityId: id,
      newValues: {
        status: 'graduated',
        ...(dto.graduation_date && { graduationDate: dto.graduation_date }),
        ...(dto.notes && { notes: dto.notes }),
      },
    });
    return this.findOne(id, actor);
  }

  private async isInScope(
    studentId: number,
    actor: AuthenticatedUser,
    roles: string[],
    em: EntityManager,
  ): Promise<boolean> {
    if (roles.includes('supervisor')) {
      const rows: unknown[] = await em.query(
        `SELECT 1 FROM supervisor_halaqat sup
         JOIN student_halaqa sh ON sh.halaqa_id = sup.halaqa_id
         WHERE sup.supervisor_user_id = ? AND sh.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    if (roles.includes('teacher')) {
      const rows: unknown[] = await em.query(
        `SELECT 1 FROM halaqa_teachers ht
         JOIN student_halaqa sh ON sh.halaqa_id = ht.halaqa_id
         WHERE ht.teacher_user_id = ? AND ht.end_date IS NULL AND sh.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    if (roles.includes('parent')) {
      const rows: unknown[] = await em.query(
        `SELECT 1 FROM student_guardians sg
         WHERE sg.guardian_user_id = ? AND sg.student_id = ? LIMIT 1`,
        [actor.id, studentId],
      );
      if (rows.length > 0) return true;
    }

    return false;
  }

  private async teacherHasPrimaryOnStudent(
    teacherUserId: number,
    studentId: number,
  ): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM halaqa_teachers ht
       JOIN student_halaqa sh ON sh.halaqa_id = ht.halaqa_id
       WHERE ht.teacher_user_id = ? AND ht.end_date IS NULL
         AND (ht.is_primary = 1 OR ht.acting_as_primary = 1)
         AND sh.student_id = ? LIMIT 1`,
      [teacherUserId, studentId],
    );
    return rows.length > 0;
  }

  /**
   * Resolves the two WhatsApp halves into the pair actually stored.
   *
   * Returns `undefined` when the caller sent neither field, so a patch leaves
   * the number alone. `null` (or an empty string) on either half clears both —
   * a dial code with no number is not a contact, and a number with no dial code
   * cannot be dialled. Sending one half while the other is unset is a 400.
   */
  private resolvePhone(
    dto: Pick<UpdateStudentDto, 'phone_country_code' | 'phone'>,
    current: Pick<Student, 'phoneCountryCode' | 'phone'> | null,
  ): { phoneCountryCode: string | null; phone: string | null } | undefined {
    const blank = (v: string | null | undefined) =>
      v === null || (typeof v === 'string' && v.trim() === '');
    const rawCode = blank(dto.phone_country_code)
      ? null
      : dto.phone_country_code;
    const rawPhone = blank(dto.phone) ? null : dto.phone;

    if (rawCode === undefined && rawPhone === undefined) return undefined;
    if (rawCode === null || rawPhone === null) {
      return { phoneCountryCode: null, phone: null };
    }

    const code =
      rawCode !== undefined
        ? normalizeCountryCode(rawCode)
        : (current?.phoneCountryCode ?? null);
    const number =
      rawPhone !== undefined
        ? normalizePhoneNumber(rawPhone)
        : (current?.phone ?? null);

    if (!code || !number) {
      throw new BadRequestException(
        'phone and phone_country_code must be sent together.',
      );
    }
    if (!PHONE_COUNTRY_CODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'phone_country_code must be a dial code such as +970.',
      );
    }
    if (!PHONE_NUMBER_PATTERN.test(number)) {
      throw new BadRequestException(
        'phone must be 4 to 15 digits, excluding the dial code.',
      );
    }

    return { phoneCountryCode: code, phone: number };
  }

  private validateCapacities(
    dto: Partial<
      Pick<
        UpdateStudentDto,
        | 'daily_hifz_pages_capacity'
        | 'daily_near_pages_capacity'
        | 'daily_far_pages_capacity'
      >
    >,
  ): void {
    if (
      dto.daily_hifz_pages_capacity !== undefined &&
      (dto.daily_hifz_pages_capacity < CAPACITY_LIMITS.hifz.min ||
        dto.daily_hifz_pages_capacity > CAPACITY_LIMITS.hifz.max)
    ) {
      throw new BadRequestException(
        `daily_hifz_pages_capacity must be between ${CAPACITY_LIMITS.hifz.min} and ${CAPACITY_LIMITS.hifz.max}`,
      );
    }
    if (
      dto.daily_near_pages_capacity !== undefined &&
      (dto.daily_near_pages_capacity < CAPACITY_LIMITS.near.min ||
        dto.daily_near_pages_capacity > CAPACITY_LIMITS.near.max)
    ) {
      throw new BadRequestException(
        `daily_near_pages_capacity must be between ${CAPACITY_LIMITS.near.min} and ${CAPACITY_LIMITS.near.max}`,
      );
    }
    if (
      dto.daily_far_pages_capacity !== undefined &&
      (dto.daily_far_pages_capacity < CAPACITY_LIMITS.far.min ||
        dto.daily_far_pages_capacity > CAPACITY_LIMITS.far.max)
    ) {
      throw new BadRequestException(
        `daily_far_pages_capacity must be between ${CAPACITY_LIMITS.far.min} and ${CAPACITY_LIMITS.far.max}`,
      );
    }
  }

  toView(student: Student, _actor: AuthenticatedUser): StudentView {
    const formatDate = (d: Date | string | null): string | null => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return String(d).split('T')[0];
    };

    const base: StudentView = {
      id: student.id,
      ...toNameFields(student),
      gender: student.gender,
      dob: formatDate(student.dob),
      join_date: formatDate(student.joinDate) ?? '',
      status: student.status,
      daily_hifz_pages_capacity: String(student.dailyHifzPagesCapacity),
      daily_hifz_capacity_unit:
        student.dailyHifzCapacityUnit ?? DEFAULT_CAPACITY_UNIT,
      daily_near_pages_capacity: String(student.dailyNearPagesCapacity),
      daily_near_capacity_unit:
        student.dailyNearCapacityUnit ?? DEFAULT_CAPACITY_UNIT,
      daily_far_pages_capacity: String(student.dailyFarPagesCapacity),
      daily_far_capacity_unit:
        student.dailyFarCapacityUnit ?? DEFAULT_CAPACITY_UNIT,
      memorization_direction: student.memorizationDirection,
      notes: student.notes,
      photo_url: student.photoUrl,
      id_number: student.idNumber,
      phone_country_code: student.phoneCountryCode,
      phone: student.phone,
      phone_e164: toE164(student.phoneCountryCode, student.phone),
    };

    return base;
  }
}
