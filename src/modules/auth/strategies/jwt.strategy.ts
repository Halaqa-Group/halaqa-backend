import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { User } from '../../users/entities/user.entity';

export interface JwtPayload {
  sub: number;
  school_id: number;
  tv: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findOne({
      where: { id: payload.sub },
      relations: { userRoles: { role: true } },
    });
    if (!user) throw new UnauthorizedException();
    if (user.tokenVersion !== payload.tv) throw new UnauthorizedException();

    return {
      id: user.id,
      schoolId: user.schoolId,
      status: user.status,
      tokenVersion: user.tokenVersion,
      roles: (user.userRoles ?? []).map((ur) => ({
        slug: ur.role.slug,
        level: ur.role.level,
      })),
    };
  }
}
