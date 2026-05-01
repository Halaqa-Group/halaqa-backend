import type { RoleSlug } from '../../modules/roles/role.entity';
import type { UserStatus } from '../../modules/users/entities/user.entity';

export interface AuthenticatedRole {
  slug: RoleSlug;
  level: number;
}

export interface AuthenticatedUser {
  id: number;
  schoolId: number;
  status: UserStatus;
  tokenVersion: number;
  roles: AuthenticatedRole[];
}
