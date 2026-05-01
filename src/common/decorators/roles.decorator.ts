import { SetMetadata } from '@nestjs/common';
import type { RoleSlug } from '../../modules/roles/role.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...slugs: RoleSlug[]) => SetMetadata(ROLES_KEY, slugs);
