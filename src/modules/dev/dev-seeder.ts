import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { Role, RoleSlug } from '../roles/role.entity';
import { UserRole } from '../roles/user-role.entity';
import { School } from '../tenant/school.entity';
import { User } from '../users/entities/user.entity';

interface UserSeed {
  name: string;
  email: string;
  password: string;
  roles: RoleSlug[];
}

const SCHOOL_NAME = 'Halaqa Demo School';

const USER_SEEDS: UserSeed[] = [
  {
    name: 'أحمد المدير',
    email: 'principal@school.com',
    password: 'Passw0rd!',
    roles: ['principal'],
  },
  {
    name: 'سامي النائب',
    email: 'vp@school.com',
    password: 'Passw0rd!',
    roles: ['vice_principal'],
  },
  {
    name: 'خالد المشرف',
    email: 'supervisor@school.com',
    password: 'Passw0rd!',
    roles: ['supervisor'],
  },
  {
    name: 'يوسف المعلم',
    email: 'teacher@school.com',
    password: 'Passw0rd!',
    roles: ['teacher'],
  },
  {
    name: 'محمد ولي الأمر',
    email: 'parent@school.com',
    password: 'Passw0rd!',
    roles: ['parent'],
  },
];

/**
 * Dev-only seeder: ensures School #1 exists and creates one user per role
 * so the role-matrix endpoints can be exercised without hand-rolling SQL.
 *
 * Skipped entirely when `NODE_ENV === 'production'`. Idempotent — re-running
 * never duplicates rows; it only fills in what is missing.
 */
@Injectable()
export class DevSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DevSeeder.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(School)
    private readonly schools: Repository<School>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoles: Repository<UserRole>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'production') return;

    const schoolId = await this.ensureSchool();
    const rolesBySlug = await this.loadRoles();
    if (rolesBySlug.size === 0) {
      this.logger.warn('No roles found — skipping dev user seed');
      return;
    }

    for (const seed of USER_SEEDS) {
      await this.ensureUser(seed, schoolId, rolesBySlug);
    }
  }

  private async ensureSchool(): Promise<number> {
    const wantedId = this.config.getOrThrow<number>('DEFAULT_SCHOOL_ID');
    const existing = await this.schools.findOne({ where: { id: wantedId } });
    if (existing) return existing.id;

    const created = await this.schools.save(
      this.schools.create({
        id: wantedId,
        name: SCHOOL_NAME,
        timezone: 'Asia/Hebron',
        status: 'active',
      }),
    );
    this.logger.log(`Seeded school "${SCHOOL_NAME}" (id=${created.id})`);
    return created.id;
  }

  private async loadRoles(): Promise<Map<RoleSlug, Role>> {
    const slugs = Array.from(new Set(USER_SEEDS.flatMap((s) => s.roles)));
    const rows = await this.roles.find({ where: { slug: In(slugs) } });
    return new Map(rows.map((r) => [r.slug, r]));
  }

  private async ensureUser(
    seed: UserSeed,
    schoolId: number,
    rolesBySlug: Map<RoleSlug, Role>,
  ): Promise<void> {
    const existing = await this.users.findOne({
      where: { email: seed.email, schoolId },
      relations: { userRoles: true },
      withDeleted: true,
    });

    let userId: number;
    if (existing) {
      userId = existing.id;
    } else {
      const passwordHash = await bcrypt.hash(
        seed.password,
        this.bcryptRounds(),
      );
      const created = await this.users.save(
        this.users.create({
          schoolId,
          name: seed.name,
          email: seed.email,
          password: passwordHash,
          status: 'active',
        }),
      );
      userId = created.id;
      this.logger.log(`Seeded user ${seed.email} (id=${userId})`);
    }

    for (const slug of seed.roles) {
      const role = rolesBySlug.get(slug);
      if (!role) {
        this.logger.warn(
          `Role "${slug}" missing — skipping link for ${seed.email}`,
        );
        continue;
      }
      const link = await this.userRoles.findOne({
        where: { userId, roleId: role.id },
      });
      if (link) continue;
      await this.userRoles.insert({
        userId,
        roleId: role.id,
        assignedBy: null,
      });
      this.logger.log(`Linked ${seed.email} → ${slug}`);
    }
  }

  private bcryptRounds(): number {
    return this.config.getOrThrow<number>('BCRYPT_ROUNDS');
  }
}
