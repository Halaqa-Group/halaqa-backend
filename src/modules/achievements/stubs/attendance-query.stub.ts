import { Injectable } from '@nestjs/common';

export interface AttendanceRecord {
  id: number | null;
  status: 'present' | 'absent' | 'excused';
}

/**
 * TODO: Replace this stub with a real import from AttendanceModule when attendance is built.
 *
 * Until then every student is treated as present on every date, so the attendance
 * gate in AchievementsService.create() always passes. Replace this class with one
 * backed by the real `attendance` table, exporting the same interface.
 *
 * Replacement steps:
 * 1. Build the attendance module with an `Attendance` entity and `AttendanceQueryService`.
 * 2. Export `AttendanceQueryService` from `AttendanceModule`.
 * 3. Import `AttendanceModule` in `AchievementsModule`.
 * 4. Delete this file and update the injection token in `achievements.module.ts`.
 */
@Injectable()
export class AttendanceQueryService {
  async findForStudentOnDate(
    _studentId: number,
    _halaqaId: number,
    _date: string,
  ): Promise<AttendanceRecord> {
    return { id: null, status: 'present' };
  }
}
