import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { StudentAttendance } from '../entities/student-attendance.entity';
import {
  StudentAttendanceService,
  SyncAttendanceEntry,
} from './student-attendance.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const teacher = (id = 7, schoolId = 1): AuthenticatedUser => ({
  id,
  schoolId,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 20 }],
});

const admin = (id = 1, schoolId = 1): AuthenticatedUser => ({
  id,
  schoolId,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 90 }],
});

const supervisor = (id = 5, schoolId = 1): AuthenticatedUser => ({
  id,
  schoolId,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'supervisor', level: 40 }],
});

const entry = (
  over: Partial<SyncAttendanceEntry> = {},
): SyncAttendanceEntry => ({
  studentId: 10,
  date: '2026-07-07',
  status: 'absent',
  ...over,
});

interface Mocks {
  repo: jest.Mocked<
    Pick<Repository<StudentAttendance>, 'findOne' | 'create' | 'save'>
  >;
  query: jest.Mock;
  audit: jest.Mocked<Pick<AuditService, 'log'>>;
}

function build(): { service: StudentAttendanceService; m: Mocks } {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x: StudentAttendance) => x),
    save: jest.fn((x: StudentAttendance) => Promise.resolve(x)),
  } as unknown as Mocks['repo'];
  const query = jest.fn();
  const dataSource = { manager: { query } } as unknown as DataSource;
  const audit = { log: jest.fn() } as unknown as Mocks['audit'];

  const service = new StudentAttendanceService(
    repo as unknown as Repository<StudentAttendance>,
    dataSource,
    audit as unknown as AuditService,
  );
  return { service, m: { repo, query, audit } };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StudentAttendanceService.bulkSync', () => {
  it('rejects roles that cannot record', async () => {
    const { service } = build();
    await expect(service.bulkSync([entry()], supervisor())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('processes accessible students and marks the rest forbidden', async () => {
    const { service, m } = build();
    // teacher can access student 10 only
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    m.repo.findOne.mockResolvedValue(null); // no existing row → create

    const result = await service.bulkSync(
      [entry({ studentId: 10 }), entry({ studentId: 20 })],
      teacher(),
    );

    expect(result.created).toBe(1);
    expect(result.forbidden).toBe(1);
    expect(result.results.find((r) => r.studentId === 20)?.outcome).toBe(
      'forbidden',
    );
    expect(m.audit.log).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on a client_uuid already stored', async () => {
    const { service, m } = build();
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    m.repo.findOne.mockResolvedValueOnce({ id: 99 } as StudentAttendance); // uuid hit

    const result = await service.bulkSync(
      [entry({ clientUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })],
      teacher(),
    );

    expect(result.duplicate).toBe(1);
    expect(m.repo.save).not.toHaveBeenCalled();
  });

  it('corrects a seeded present row and records the original status', async () => {
    const { service, m } = build();
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    const seeded = {
      id: 9,
      status: 'present',
      originalStatus: null,
      modifiedBy: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(seeded); // no uuid → student/date lookup

    const result = await service.bulkSync(
      [entry({ status: 'absent' })],
      teacher(),
    );

    expect(result.updated).toBe(1);
    expect(seeded.status).toBe('absent');
    expect(seeded.originalStatus).toBe('present');
    expect(seeded.modifiedBy).toBe(7);
  });
});

describe('StudentAttendanceService.correct', () => {
  it('404s when the row is missing in the actor school', async () => {
    const { service, m } = build();
    m.repo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.correct(
        1,
        { status: 'absent', modificationReason: 'x' },
        admin(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('applies the correction with modification tracking', async () => {
    const { service, m } = build();
    const row = {
      id: 3,
      studentId: 10,
      status: 'present',
      originalStatus: null,
      modifiedBy: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(row);
    m.query.mockResolvedValueOnce([{ id: 10 }]); // admin school-scope check

    const out = await service.correct(
      3,
      { status: 'excused', modificationReason: 'medical note' },
      admin(),
    );

    expect(out.status).toBe('excused');
    expect(out.originalStatus).toBe('present');
    expect(out.modificationReason).toBe('medical note');
    expect(m.audit.log).toHaveBeenCalledTimes(1);
  });
});
