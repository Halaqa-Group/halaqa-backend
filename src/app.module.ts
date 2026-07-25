import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainEventsModule } from './common/events/domain-events';
import { HealthController } from './common/health/health.controller';
import { envValidationSchema } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DevSeederModule } from './modules/dev/dev-seeder.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DailyReportsModule } from './modules/daily-reports/daily-reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HalaqatModule } from './modules/halaqat/halaqat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RolesModule } from './modules/roles/roles.module';
import { StudentsModule } from './modules/students/students.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    ScheduleModule.forRoot(),
    DomainEventsModule,
    TenantModule,
    UsersModule,
    RolesModule,
    AuthModule,
    AuditModule,
    NotificationsModule,
    HalaqatModule,
    StudentsModule,
    AttendanceModule,
    AchievementsModule,
    DailyReportsModule,
    DashboardModule,
    DevSeederModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
