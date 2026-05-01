import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleSlug } from '../../modules/roles/role.entity';
import { MIN_ROLE_LEVEL_KEY } from '../decorators/min-role-level.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredSlugs = this.reflector.getAllAndOverride<RoleSlug[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const minLevel = this.reflector.getAllAndOverride<number>(
      MIN_ROLE_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredSlugs?.length && minLevel === undefined) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = req.user.roles;

    if (requiredSlugs?.length) {
      const userSlugs = new Set(userRoles.map((r) => r.slug));
      if (!requiredSlugs.some((slug) => userSlugs.has(slug))) {
        throw new ForbiddenException('Forbidden');
      }
    }

    if (minLevel !== undefined) {
      const maxLevel = userRoles.reduce((m, r) => Math.max(m, r.level), 0);
      if (maxLevel < minLevel) {
        throw new ForbiddenException('Forbidden');
      }
    }

    return true;
  }
}
