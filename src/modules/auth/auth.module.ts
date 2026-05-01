import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActiveUserGuard } from '../../common/guards/active-user.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { LoginAttempt } from './entities/login-attempt.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SessionsController } from './sessions.controller';
import { AuthService } from './services/auth.service';
import { RateLimitService } from './services/rate-limit.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256' as const,
          expiresIn: config.get<string>(
            'JWT_ACCESS_TTL',
            '15m',
          ) as unknown as number,
        },
      }),
    }),
    TypeOrmModule.forFeature([RefreshToken, LoginAttempt, PasswordResetToken]),
    UsersModule,
  ],
  controllers: [AuthController, SessionsController],
  providers: [
    JwtStrategy,
    TokenService,
    RateLimitService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ActiveUserGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [TypeOrmModule, PassportModule, TokenService, AuthService],
})
export class AuthModule {}
