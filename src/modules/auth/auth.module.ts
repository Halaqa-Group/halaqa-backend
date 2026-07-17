import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActiveUserGuard } from '../../common/guards/active-user.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ID_NUMBER_VALIDATOR } from '../../common/validators/id-number-validator.interface';
import { PalestinianIdValidator } from '../../common/validators/palestinian-id.validator';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { LoginAttempt } from './entities/login-attempt.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { MeController } from './me.controller';
import { SessionsController } from './sessions.controller';
import { AuthService } from './services/auth.service';
import { MAIL_SERVICE, NodemailerMailService } from './services/mail.service';
import { PasswordResetService } from './services/password-reset.service';
import { RateLimitService } from './services/rate-limit.service';
import { RefreshTokenCleanupService } from './services/refresh-token-cleanup.service';
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
  controllers: [AuthController, SessionsController, MeController],
  providers: [
    JwtStrategy,
    TokenService,
    RateLimitService,
    AuthService,
    PasswordResetService,
    RefreshTokenCleanupService,
    NodemailerMailService,
    { provide: MAIL_SERVICE, useExisting: NodemailerMailService },
    { provide: ID_NUMBER_VALIDATOR, useClass: PalestinianIdValidator },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ActiveUserGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [
    TypeOrmModule,
    PassportModule,
    TokenService,
    AuthService,
    MAIL_SERVICE,
  ],
})
export class AuthModule {}
