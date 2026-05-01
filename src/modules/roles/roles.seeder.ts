import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, RoleSlug } from './role.entity';

interface RoleSeed {
  slug: RoleSlug;
  nameAr: string;
  nameEn: string;
  description: string;
  level: number;
}

const FIXED_ROLES: RoleSeed[] = [
  {
    slug: 'principal',
    nameAr: 'مدير',
    nameEn: 'Principal',
    description: 'Full school management',
    level: 100,
  },
  {
    slug: 'vice_principal',
    nameAr: 'نائب مدير',
    nameEn: 'Vice Principal',
    description: 'Same as principal except user management',
    level: 90,
  },
  {
    slug: 'supervisor',
    nameAr: 'مشرف',
    nameEn: 'Supervisor',
    description: 'Oversees a set of halaqat',
    level: 70,
  },
  {
    slug: 'teacher',
    nameAr: 'معلم',
    nameEn: 'Teacher',
    description: 'Teaches one or more halaqat',
    level: 50,
  },
  {
    slug: 'parent',
    nameAr: 'ولي أمر',
    nameEn: 'Parent',
    description: 'Views children progress',
    level: 20,
  },
];

@Injectable()
export class RolesSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(RolesSeeder.name);

  constructor(
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const seed of FIXED_ROLES) {
      const existing = await this.rolesRepo.findOne({
        where: { slug: seed.slug },
      });
      if (existing) continue;
      await this.rolesRepo.insert(seed);
      this.logger.log(`Seeded role "${seed.slug}"`);
    }
  }
}
