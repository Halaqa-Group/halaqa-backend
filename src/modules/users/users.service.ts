import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ID_NUMBER_VALIDATOR,
  type IdNumberValidator,
} from '../../common/validators/id-number-validator.interface';
import { namePartsPatch } from '../../common/person-name';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role, type RoleSlug } from '../roles/role.entity';
import { UserRole } from '../roles/user-role.entity';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

export interface UserView {
  id: number;
  firstName: string;
  secondName: string;
  thirdName: string;
  familyName: string;
  /** Derived by the database from the four parts above; never written directly. */
  name: string;
  idNumber: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  status: User['status'];
  roles: string[];
  /** Stamped when a verification link is consumed; null while unverified. */
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserListResult {
  items: UserView[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ID_NUMBER_VALIDATOR)
    private readonly idValidator: IdNumberValidator,
  ) {}

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    const email = dto.email?.trim() ? dto.email.trim() : null;
    if (email !== null && (await this.emailTaken(email, actor.schoolId))) {
      throw new ConflictException('Email already in use');
    }

    const idNumber = this.idValidator.normalize(dto.id_number);
    if (!this.idValidator.validate(idNumber).ok) {
      throw new BadRequestException('id_number format is invalid.');
    }
    if (await this.idNumberTaken(idNumber, actor.schoolId)) {
      throw new ConflictException('ID number already in use');
    }

    const roleEntities = await this.resolveRoles(dto.roles ?? []);
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());

    const userId = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const userRoleRepo = manager.getRepository(UserRole);

      const created = await userRepo.save(
        userRepo.create({
          schoolId: actor.schoolId,
          firstName: dto.first_name,
          secondName: dto.second_name,
          thirdName: dto.third_name,
          familyName: dto.family_name,
          idNumber,
          email,
          password: passwordHash,
          phone: dto.phone ?? null,
          photoUrl: dto.photo_url ?? null,
          status: dto.status ?? 'active',
        }),
      );

      if (roleEntities.length > 0) {
        await userRoleRepo.insert(
          roleEntities.map((role) => ({
            userId: created.id,
            roleId: role.id,
            assignedBy: actor.id,
          })),
        );
      }

      return created.id;
    });

    return this.findOne(userId, actor.schoolId);
  }

  async findAll(
    query: ListUsersQuery,
    schoolId: number,
  ): Promise<UserListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.userRoles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .where('user.schoolId = :schoolId', { schoolId })
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(user.name LIKE :s OR user.email LIKE :s OR user.idNumber LIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.role) {
      qb.andWhere('role.slug = :role', { role: query.role });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((u) => this.toView(u)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: number, schoolId: number): Promise<UserView> {
    const user = await this.users.findOne({
      where: { id, schoolId },
      relations: { userRoles: { role: true } },
    });
    if (!user) throw new NotFoundException();
    return this.toView(user);
  }

  async updateMe(userId: number, dto: UpdateMeDto): Promise<UserView> {
    await this.users.update(userId, {
      ...namePartsPatch(dto),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.photo_url !== undefined && { photoUrl: dto.photo_url }),
    });
    return this.findOneById(userId);
  }

  async changePassword(
    userId: number,
    dto: ChangePasswordDto,
    currentRefreshHash: string | null,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new UnauthorizedException('Invalid current password');
    }

    const newHash = await bcrypt.hash(dto.password, this.bcryptRounds());
    await this.users.update(userId, { password: newHash });

    await this.refreshTokens.update(
      {
        userId,
        revokedAt: IsNull(),
        ...(currentRefreshHash !== null && {
          tokenHash: Not(currentRefreshHash),
        }),
      },
      { revokedAt: new Date(), revokedReason: 'password_change' },
    );
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    const user = await this.findRawOrThrow(id, actor.schoolId);

    const willDisable =
      dto.status !== undefined &&
      dto.status !== 'active' &&
      user.status === 'active';

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).update(id, {
        ...namePartsPatch(dto),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.photo_url !== undefined && { photoUrl: dto.photo_url }),
        ...(dto.status !== undefined && { status: dto.status }),
      });

      if (willDisable) {
        await this.bumpTokenVersion(id, manager);
        await this.revokeRefreshTokens(id, 'admin_action', manager);
      }
    });

    return this.findOne(id, actor.schoolId);
  }

  async softDelete(id: number, actor: AuthenticatedUser): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('Cannot delete your own account');
    }
    const user = await this.findRawOrThrow(id, actor.schoolId);
    if (user.deletedAt !== null) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(User).softDelete(id);
      await this.bumpTokenVersion(id, manager);
      await this.revokeRefreshTokens(id, 'admin_action', manager);
    });
  }

  async assignRole(
    userId: number,
    roleId: number,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    await this.findRawOrThrow(userId, actor.schoolId);
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Unknown role');

    const existing = await this.userRoles.findOne({
      where: { userId, roleId },
    });
    if (!existing) {
      await this.userRoles.insert({ userId, roleId, assignedBy: actor.id });
    }
    return this.findOne(userId, actor.schoolId);
  }

  async findByEmail(
    email: string,
    schoolId: number,
    withDeleted = false,
  ): Promise<User | null> {
    return this.users.findOne({ where: { email, schoolId }, withDeleted });
  }

  async ensureRoleBySlug(
    userId: number,
    slug: RoleSlug,
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<boolean> {
    const role = await this.rolesRepo.findOne({ where: { slug } });
    if (!role) throw new BadRequestException(`Unknown role slug: ${slug}`);

    const userRoleRepo = manager?.getRepository(UserRole) ?? this.userRoles;
    const existing = await userRoleRepo.findOne({
      where: { userId, roleId: role.id },
    });
    if (existing) return false;

    await userRoleRepo.insert({
      userId,
      roleId: role.id,
      assignedBy: actor.id,
    });
    return true;
  }

  async removeRole(
    userId: number,
    roleId: number,
    actor: AuthenticatedUser,
  ): Promise<UserView> {
    await this.findRawOrThrow(userId, actor.schoolId);
    const result = await this.userRoles.delete({ userId, roleId });
    if (result.affected === 0) throw new NotFoundException();
    return this.findOne(userId, actor.schoolId);
  }

  async adminResetPassword(
    userId: number,
    dto: AdminResetPasswordDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.findRawOrThrow(userId, actor.schoolId);
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds());

    await this.dataSource.transaction(async (manager) => {
      await this.setPasswordAndBumpVersion(userId, passwordHash, manager);
      await this.revokeRefreshTokens(userId, 'admin_action', manager);
    });
  }

  /**
   * Sets the user's password hash and increments token_version atomically.
   * Bumping token_version invalidates outstanding access tokens on the next
   * request via JwtStrategy's tv check (BR-AUTH-08, BR-USR-07). The caller is
   * responsible for revoking refresh tokens separately.
   */
  async setPasswordAndBumpVersion(
    userId: number,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(User) ?? this.users;
    await repo
      .createQueryBuilder()
      .update(User)
      .set({
        password: passwordHash,
        tokenVersion: () => 'token_version + 1',
      })
      .where('id = :id', { id: userId })
      .execute();
  }

  private async findOneById(id: number): Promise<UserView> {
    const user = await this.users.findOne({
      where: { id },
      relations: { userRoles: { role: true } },
    });
    if (!user) throw new NotFoundException();
    return this.toView(user);
  }

  private async findRawOrThrow(id: number, schoolId: number): Promise<User> {
    const user = await this.users.findOne({ where: { id, schoolId } });
    if (!user) throw new NotFoundException();
    return user;
  }

  private async emailTaken(email: string, schoolId: number): Promise<boolean> {
    const existing = await this.users.findOne({
      where: { email, schoolId },
      withDeleted: true,
    });
    return !!existing;
  }

  private async idNumberTaken(
    idNumber: string,
    schoolId: number,
  ): Promise<boolean> {
    const existing = await this.users.findOne({
      where: { idNumber, schoolId },
      withDeleted: true,
    });
    return !!existing;
  }

  private async resolveRoles(slugs: string[]): Promise<Role[]> {
    if (slugs.length === 0) return [];
    const roles = await this.rolesRepo.find({ where: { slug: In(slugs) } });
    if (roles.length !== slugs.length) {
      throw new BadRequestException('Unknown role slug');
    }
    return roles;
  }

  private async bumpTokenVersion(
    userId: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(User)
      .createQueryBuilder()
      .update(User)
      .set({ tokenVersion: () => 'token_version + 1' })
      .where('id = :id', { id: userId })
      .execute();
  }

  private async revokeRefreshTokens(
    userId: number,
    reason: RefreshToken['revokedReason'],
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date(), revokedReason: reason },
      );
  }

  private toView(user: User): UserView {
    return {
      id: user.id,
      firstName: user.firstName,
      secondName: user.secondName,
      thirdName: user.thirdName,
      familyName: user.familyName,
      name: user.name,
      idNumber: user.idNumber,
      email: user.email,
      phone: user.phone,
      photoUrl: user.photoUrl,
      status: user.status,
      roles: (user.userRoles ?? []).map((ur) => ur.role.slug),
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private bcryptRounds(): number {
    return this.config.getOrThrow<number>('BCRYPT_ROUNDS');
  }
}
