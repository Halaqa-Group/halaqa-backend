import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AuditLog } from '../modules/audit/audit-log.entity';
import { Achievement } from '../modules/achievements/entities/achievement.entity';
import { AchievementRecitationPosition } from '../modules/achievements/entities/achievement-recitation-position.entity';
import { AchievementPositionError } from '../modules/achievements/entities/achievement-position-error.entity';
import { WeeklyPlan } from '../modules/achievements/entities/weekly-plan.entity';
import { WeeklyPlanItem } from '../modules/achievements/entities/weekly-plan-item.entity';
import { Holiday } from '../modules/attendance/entities/holiday.entity';
import { SchoolSchedule } from '../modules/attendance/entities/school-schedule.entity';
import { StudentAttendance } from '../modules/attendance/entities/student-attendance.entity';
import { TeacherAttendance } from '../modules/attendance/entities/teacher-attendance.entity';
import { EmailVerificationToken } from '../modules/auth/entities/email-verification-token.entity';
import { LoginAttempt } from '../modules/auth/entities/login-attempt.entity';
import { PasswordResetToken } from '../modules/auth/entities/password-reset-token.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { DailyHalaqaReport } from '../modules/daily-reports/entities/daily-halaqa-report.entity';
import { DailyStudentEvaluation } from '../modules/daily-reports/entities/daily-student-evaluation.entity';
import { HalaqaActivityLog } from '../modules/halaqat/entities/halaqa-activity-log.entity';
import { HalaqaTeacher } from '../modules/halaqat/entities/halaqa-teacher.entity';
import { Halaqa } from '../modules/halaqat/entities/halaqa.entity';
import { StudentHalaqa } from '../modules/halaqat/entities/student-halaqa.entity';
import { StudentHalaqaEnrollment } from '../modules/halaqat/entities/student-halaqa-enrollment.entity';
import { SupervisorHalaqa } from '../modules/halaqat/entities/supervisor-halaqa.entity';
import { Role } from '../modules/roles/role.entity';
import { UserRole } from '../modules/roles/user-role.entity';
import { MemorizationJob } from '../modules/students/entities/memorization-job.entity';
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
    EmailVerificationToken,
    AuditLog,
    Student,
    StudentGuardian,
    MemorizationJob,
    Halaqa,
    HalaqaTeacher,
    StudentHalaqa,
    StudentHalaqaEnrollment,
    SupervisorHalaqa,
    HalaqaActivityLog,
    DailyHalaqaReport,
    DailyStudentEvaluation,
    Achievement,
    AchievementRecitationPosition,
    AchievementPositionError,
    WeeklyPlan,
    WeeklyPlanItem,
    StudentAttendance,
    TeacherAttendance,
    SchoolSchedule,
    Holiday,
  ],
  migrations: ['migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
