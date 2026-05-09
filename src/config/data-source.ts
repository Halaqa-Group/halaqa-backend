import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AuditLog } from '../modules/audit/audit-log.entity';
import { LoginAttempt } from '../modules/auth/entities/login-attempt.entity';
import { PasswordResetToken } from '../modules/auth/entities/password-reset-token.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { HalaqaActivityLog } from '../modules/halaqat/entities/halaqa-activity-log.entity';
import { HalaqaSchedule } from '../modules/halaqat/entities/halaqa-schedule.entity';
import { HalaqaTeacher } from '../modules/halaqat/entities/halaqa-teacher.entity';
import { Halaqa } from '../modules/halaqat/entities/halaqa.entity';
import { StudentHalaqa } from '../modules/halaqat/entities/student-halaqa.entity';
import { SupervisorHalaqa } from '../modules/halaqat/entities/supervisor-halaqa.entity';
import { Role } from '../modules/roles/role.entity';
import { UserRole } from '../modules/roles/user-role.entity';
import { StudentGuardian } from '../modules/students/entities/student-guardian.entity';
import { Student } from '../modules/students/entities/student.entity';
import { School } from '../modules/tenant/school.entity';
import { User } from '../modules/users/entities/user.entity';

/**
 * Standalone DataSource for the TypeORM CLI (migration:generate / run / revert).
 * The Nest runtime uses `buildTypeOrmOptions` instead — this file is for the
 * CLI only, so it reads `.env` directly via `dotenv/config`.
 *
 * Migrations are committed to `migrations/`. Production runs them with
 * `DB_SYNCHRONIZE=false`; dev keeps `synchronize: true` for fast iteration.
 */
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  timezone: 'Z',
  entities: [
    School,
    User,
    Role,
    UserRole,
    RefreshToken,
    LoginAttempt,
    PasswordResetToken,
    AuditLog,
    Student,
    StudentGuardian,
    Halaqa,
    HalaqaTeacher,
    HalaqaSchedule,
    StudentHalaqa,
    SupervisorHalaqa,
    HalaqaActivityLog,
  ],
  migrations: ['migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
