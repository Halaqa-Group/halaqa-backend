import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Roles whose attendance is seeded (staff only — parents are excluded). */
const STAFF_ROLE_SLUGS = [
  'principal',
  'vice_principal',
  'supervisor',
  'teacher',
];

/**
 * "Present by default" seeding. Every obligated student and staff member gets a
 * `present` row created ahead of time; teachers/admins then mark the exceptions.
 *
 * Obligated on a date = active, non-deleted subject whose school operates that
 * weekday (an effective `school_schedules` row) and the date is not a holiday.
 * The school schedule is the single source of operating days for both students
 * and staff.
 *
 * Each insert is idempotent (skips subjects who already have a row), so it is
 * safe to re-run — that is exactly the boot-time catch-up for a server that was
 * down at midnight.
 *
 * Day convention: 0=Saturday … 6=Friday, so WEEKDAY(d) maps via (WEEKDAY(d)+2)%7.
 */
@Injectable()
export class AttendanceSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendanceSeedService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Boot-time catch-up: if the server was down at midnight, seed today now. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const affected = await this.seedForDate(await this.today());
      if (affected > 0) {
        this.logger.log(
          `boot catch-up: seeded ${affected} present row(s) for today`,
        );
      }
    } catch (err) {
      this.logger.error(
        'boot catch-up seeding failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Nightly at 00:05 (server tz) — seed the present rows for the new day. */
  @Cron('5 0 * * *')
  async seedToday(): Promise<void> {
    const affected = await this.seedForDate(await this.today());
    this.logger.log(`nightly seed: created ${affected} present row(s)`);
  }

  /**
   * Seed `present` rows for every obligated student and staff member on `date`
   * who does not already have one. Returns the total number of rows created.
   */
  async seedForDate(date: string): Promise<number> {
    const students = await this.seedStudentsForDate(date);
    const staff = await this.seedStaffForDate(date);
    return students + staff;
  }

  private async seedStudentsForDate(date: string): Promise<number> {
    const result: { affectedRows?: number } =
      await this.dataSource.manager.query(
        `INSERT INTO student_attendances
         (school_id, student_id, attendance_date, status, recorded_at, created_at)
       SELECT s.school_id, s.id, ?, 'present', NOW(6), NOW(6)
       FROM students s
       WHERE s.status = 'active'
         AND s.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM school_schedules ss
           WHERE ss.school_id = s.school_id
             AND ss.day_of_week = (WEEKDAY(?) + 2) % 7
             AND ss.effective_from <= ?
             AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM holidays h
           WHERE h.school_id = s.school_id AND h.holiday_date = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM student_attendances a
           WHERE a.student_id = s.id AND a.attendance_date = ?
         )`,
        [date, date, date, date, date, date],
      );
    return result?.affectedRows ?? 0;
  }

  private async seedStaffForDate(date: string): Promise<number> {
    const rolePlaceholders = STAFF_ROLE_SLUGS.map(() => '?').join(', ');
    const result: { affectedRows?: number } =
      await this.dataSource.manager.query(
        `INSERT INTO teacher_attendances
         (school_id, user_id, attendance_date, status, recorded_at, created_at)
       SELECT u.school_id, u.id, ?, 'present', NOW(6), NOW(6)
       FROM users u
       WHERE u.status = 'active'
         AND u.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.slug IN (${rolePlaceholders})
         )
         AND EXISTS (
           SELECT 1 FROM school_schedules ss
           WHERE ss.school_id = u.school_id
             AND ss.day_of_week = (WEEKDAY(?) + 2) % 7
             AND ss.effective_from <= ?
             AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM holidays h
           WHERE h.school_id = u.school_id AND h.holiday_date = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM teacher_attendances a
           WHERE a.user_id = u.id AND a.attendance_date = ?
         )`,
        [date, ...STAFF_ROLE_SLUGS, date, date, date, date, date],
      );
    return result?.affectedRows ?? 0;
  }

  /** Today's date as 'YYYY-MM-DD' in the database/server timezone. */
  private async today(): Promise<string> {
    const rows: { d: string }[] = await this.dataSource.manager.query(
      'SELECT CAST(CURDATE() AS CHAR) AS d',
    );
    return rows[0].d;
  }
}
