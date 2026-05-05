import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { generateRawToken, hashToken } from '../../auth/token-crypto';
import { PasswordResetToken } from '../../auth/entities/password-reset-token.entity';
import {
  MAIL_SERVICE,
  type MailService,
} from '../../auth/services/mail.service';
import {
  NOTIFICATION_SERVICE,
  type NotificationService,
} from '../../notifications/notification.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { LinkGuardianDto } from '../dto/link-guardian.dto';
import { UpdateGuardianDto } from '../dto/update-guardian.dto';
import { GuardianView } from '../dto/student.responses';
import { Student } from '../entities/student.entity';
import { StudentGuardian } from '../entities/student-guardian.entity';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class GuardiansService {
  constructor(
    @InjectRepository(StudentGuardian)
    private readonly sgRepo: Repository<StudentGuardian>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(MAIL_SERVICE) private readonly mail: MailService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
  ) {}

  async listForStudentId(studentId: number): Promise<GuardianView[]> {
    const rows = await this.sgRepo.find({
      where: { studentId },
      relations: { guardian: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((sg) => this.toGuardianView(sg));
  }

  async link(
    studentId: number,
    dto: LinkGuardianDto,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<GuardianView> {
    if (dto.guardian_user_id !== undefined && dto.email !== undefined) {
      throw new BadRequestException(
        'Provide either guardian_user_id or email, not both',
      );
    }

    let guardianUserId: number;
    let createdParent = false;

    const em = manager ?? this.dataSource.manager;

    if (dto.guardian_user_id !== undefined) {
      const user = await em.findOne(User, {
        where: { id: dto.guardian_user_id, schoolId: actor.schoolId },
      });
      if (!user) throw new NotFoundException();
      guardianUserId = user.id;
      const assigned = await this.usersService.ensureRoleBySlug(
        guardianUserId,
        'parent',
        actor,
        manager,
      );
      if (assigned) {
        await this.audit.log({
          actor,
          action: 'user.role.assign',
          entityType: 'user',
          entityId: guardianUserId,
          newValues: { role: 'parent' },
        });
      }
    } else if (dto.email !== undefined) {
      const existing = await this.usersService.findByEmail(
        dto.email,
        actor.schoolId,
      );
      if (existing) {
        guardianUserId = existing.id;
        const assigned = await this.usersService.ensureRoleBySlug(
          guardianUserId,
          'parent',
          actor,
          manager,
        );
        if (assigned) {
          await this.audit.log({
            actor,
            action: 'user.role.assign',
            entityType: 'user',
            entityId: guardianUserId,
            newValues: { role: 'parent' },
          });
        }
      } else {
        if (!dto.name) {
          throw new BadRequestException(
            'name is required when creating a new parent user',
          );
        }
        const tempPassword = await bcrypt.hash(
          generateRawToken(),
          this.bcryptRounds(),
        );
        const newUser = await em.save(
          em.create(User, {
            schoolId: actor.schoolId,
            name: dto.name,
            email: dto.email,
            password: tempPassword,
            phone: dto.phone ?? null,
            status: 'active',
          }),
        );
        guardianUserId = newUser.id;
        createdParent = true;

        await this.usersService.ensureRoleBySlug(
          guardianUserId,
          'parent',
          actor,
          manager,
        );
        await this.audit.log({
          actor,
          action: 'user.role.assign',
          entityType: 'user',
          entityId: guardianUserId,
          newValues: { role: 'parent', createdUser: true },
        });

        const raw = generateRawToken();
        await em.save(
          em.create(PasswordResetToken, {
            userId: guardianUserId,
            tokenHash: hashToken(raw),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          }),
        );
        const appUrl = this.config.getOrThrow<string>('APP_URL');
        await this.mail.sendParentInvite(dto.email, `${appUrl}/auth/reset?token=${raw}`);
      }
    } else {
      throw new BadRequestException(
        'Either guardian_user_id or email is required',
      );
    }

    return this.dataSource.transaction(async (tx) => {
      const txManager = manager ?? tx;
      const existing = await txManager.findOne(StudentGuardian, {
        where: { studentId, guardianUserId },
      });
      if (existing) {
        throw new BadRequestException('Guardian already linked to this student');
      }

      const count = await txManager.count(StudentGuardian, {
        where: { studentId },
      });

      const isPrimary = count === 0 ? true : (dto.is_primary ?? false);

      if (isPrimary && count > 0) {
        await this.unsetExistingPrimary(txManager, studentId);
      }

      const sg = await txManager.save(
        txManager.create(StudentGuardian, {
          studentId,
          guardianUserId,
          relation: dto.relation,
          isPrimary,
          canPickup: dto.can_pickup ?? true,
        }),
      );

      await this.audit.log({
        actor,
        action: 'student.guardian.link',
        entityType: 'student_guardian',
        entityId: studentId,
        newValues: {
          studentId,
          guardianUserId,
          relation: dto.relation,
          isPrimary,
          canPickup: dto.can_pickup ?? true,
          createdParent,
        },
      });

      const full = await txManager.findOne(StudentGuardian, {
        where: { studentId: sg.studentId, guardianUserId: sg.guardianUserId },
        relations: { guardian: true },
      });
      return this.toGuardianView(full!);
    });
  }

  async linkMany(
    studentId: number,
    dtos: LinkGuardianDto[],
    actor: AuthenticatedUser,
    manager: EntityManager,
  ): Promise<void> {
    for (let i = 0; i < dtos.length; i++) {
      const dto = { ...dtos[i] };
      if (i === 0) dto.is_primary = true;
      await this.link(studentId, dto, actor, manager);
    }
  }

  async update(
    studentId: number,
    guardianUserId: number,
    dto: UpdateGuardianDto,
    actor: AuthenticatedUser,
  ): Promise<GuardianView> {
    const sg = await this.sgRepo.findOne({
      where: { studentId, guardianUserId },
      relations: { guardian: true },
    });
    if (!sg) throw new NotFoundException();

    if (dto.is_primary === false) {
      throw new BadRequestException(
        'At least one guardian must be primary. To switch primaries, PATCH the new primary guardian to is_primary=true.',
      );
    }

    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    await this.dataSource.transaction(async (manager) => {
      if (dto.is_primary === true && !sg.isPrimary) {
        await this.unsetExistingPrimary(manager, studentId);
        oldValues.isPrimary = sg.isPrimary;
        newValues.isPrimary = true;
        sg.isPrimary = true;
      }
      if (dto.relation !== undefined && dto.relation !== sg.relation) {
        oldValues.relation = sg.relation;
        newValues.relation = dto.relation;
        sg.relation = dto.relation;
      }
      if (dto.can_pickup !== undefined && dto.can_pickup !== sg.canPickup) {
        oldValues.canPickup = sg.canPickup;
        newValues.canPickup = dto.can_pickup;
        sg.canPickup = dto.can_pickup;
      }
      await manager.save(sg);
    });

    await this.audit.log({
      actor,
      action: 'student.guardian.update',
      entityType: 'student_guardian',
      entityId: studentId,
      oldValues: Object.keys(oldValues).length ? oldValues : null,
      newValues: Object.keys(newValues).length ? newValues : null,
    });

    const refreshed = await this.sgRepo.findOne({
      where: { studentId, guardianUserId },
      relations: { guardian: true },
    });
    return this.toGuardianView(refreshed!);
  }

  async unlink(
    studentId: number,
    guardianUserId: number,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const sg = await this.sgRepo.findOne({ where: { studentId, guardianUserId } });
    if (!sg) throw new NotFoundException();

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(StudentGuardian, { studentId, guardianUserId });

      await this.audit.log({
        actor,
        action: 'student.guardian.unlink',
        entityType: 'student_guardian',
        entityId: studentId,
        oldValues: { guardianUserId, relation: sg.relation, isPrimary: sg.isPrimary },
      });

      const remaining = await manager.find(StudentGuardian, {
        where: { studentId },
        order: { createdAt: 'ASC' },
      });

      if (remaining.length === 0) {
        const student = await manager.findOne(Student, {
          where: { id: studentId },
        });
        await this.audit.log({
          actor,
          action: 'student.orphaned',
          entityType: 'student',
          entityId: studentId,
        });
        await this.notifications.notifyRole(
          actor.schoolId,
          'vice_principal',
          {
            type: 'student.orphaned',
            studentId,
            studentName: student?.name ?? '',
          },
        );
        return;
      }

      if (sg.isPrimary && remaining.length > 0) {
        const promote = remaining[0];
        await manager.update(
          StudentGuardian,
          { studentId: promote.studentId, guardianUserId: promote.guardianUserId },
          { isPrimary: true },
        );
        await this.audit.log({
          actor,
          action: 'student.guardian.primary_promoted',
          entityType: 'student_guardian',
          entityId: studentId,
          newValues: { promotedGuardianUserId: promote.guardianUserId },
        });
      }
    });
  }

  private async unsetExistingPrimary(
    manager: EntityManager,
    studentId: number,
  ): Promise<void> {
    await manager.update(
      StudentGuardian,
      { studentId, isPrimary: true },
      { isPrimary: false },
    );
  }

  private toGuardianView(sg: StudentGuardian): GuardianView {
    return {
      user: {
        id: sg.guardian.id,
        name: sg.guardian.name,
        email: sg.guardian.email,
        phone: sg.guardian.phone,
      },
      relation: sg.relation,
      is_primary: !!sg.isPrimary,
      can_pickup: !!sg.canPickup,
    };
  }

  private bcryptRounds(): number {
    return this.config.getOrThrow<number>('BCRYPT_ROUNDS');
  }
}
