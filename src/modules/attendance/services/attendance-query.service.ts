import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AttendanceStatus,
  StudentAttendance,
} from '../entities/student-attendance.entity';

export interface AttendanceRecord {
  id: number | null;
  status: AttendanceStatus;
}

/**
 * Read-only cross-module facade over student attendance. Fulfils the contract
 * the achievements module depends on (previously a stub).
 *
 * `halaqaId` is part of the contract but ignored at the storage layer: there is
 * one attendance row per (student, date) regardless of how many halaqat the
 * student belongs to.
 */
@Injectable()
export class AttendanceQueryService {
  constructor(
    @InjectRepository(StudentAttendance)
    private readonly repo: Repository<StudentAttendance>,
  ) {}

  async findForStudentOnDate(
    studentId: number,
    _halaqaId: number,
    date: string,
  ): Promise<AttendanceRecord> {
    const row = await this.repo.findOne({
      where: { studentId, attendanceDate: date },
      select: { id: true, status: true },
    });

    // No row (e.g. the seed cron hasn't run for this date) is treated as
    // present so the achievements attendance gate doesn't hard-block. Explicit
    // absences always exist as rows and are returned as such.
    if (!row) return { id: null, status: 'present' };
    return { id: row.id, status: row.status };
  }
}
