import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

  it('defaults a newly synced row to the full ethics rating', async () => {
    const { service, m } = build();
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    m.repo.findOne.mockResolvedValueOnce(null); // no existing (student, date) row

    await service.bulkSync([entry()], teacher());

    const created = m.repo.create.mock.calls[0][0] as StudentAttendance;
    expect(created.ethicsRating).toBe(5);
  });

  it('carries a synced ethics rating onto an existing row', async () => {
    const { service, m } = build();
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    const seeded = {
      id: 9,
      status: 'present',
      ethicsRating: 5,
      originalStatus: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(seeded);

    await service.bulkSync([entry({ ethicsRating: 1 })], teacher());

    expect(seeded.ethicsRating).toBe(1);
  });

  it('leaves an existing rating alone when the entry omits one', async () => {
    const { service, m } = build();
    m.query.mockResolvedValueOnce([{ student_id: 10 }]);
    const seeded = {
      id: 9,
      status: 'present',
      ethicsRating: 2,
      originalStatus: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(seeded);

    await service.bulkSync([entry()], teacher());

    expect(seeded.ethicsRating).toBe(2);
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

  it('lowers the ethics rating without touching the status', async () => {
    const { service, m } = build();
    const row = {
      id: 3,
      studentId: 10,
      status: 'present',
      ethicsRating: 5,
      originalStatus: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(row);
    m.query.mockResolvedValueOnce([{ id: 10 }]);

    const out = await service.correct(
      3,
      { ethicsRating: 2, modificationReason: 'disruptive in class' },
      admin(),
    );

    expect(out.ethicsRating).toBe(2);
    expect(out.status).toBe('present');
    // Status never changed, so the pre-correction status stays uncaptured.
    expect(out.originalStatus).toBeNull();
    expect(out.modifiedBy).toBe(1);
  });

  it('applies a combined status and rating correction', async () => {
    const { service, m } = build();
    const row = {
      id: 3,
      studentId: 10,
      status: 'present',
      ethicsRating: 5,
      originalStatus: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(row);
    m.query.mockResolvedValueOnce([{ id: 10 }]);

    const out = await service.correct(
      3,
      { status: 'late', ethicsRating: 3, modificationReason: 'arrived late' },
      admin(),
    );

    expect(out.status).toBe('late');
    expect(out.originalStatus).toBe('present');
    expect(out.ethicsRating).toBe(3);
  });

  it('400s when neither the status nor the rating would change', async () => {
    const { service, m } = build();
    const row = {
      id: 3,
      studentId: 10,
      status: 'present',
      ethicsRating: 5,
      originalStatus: null,
    } as unknown as StudentAttendance;
    m.repo.findOne.mockResolvedValueOnce(row);
    m.query.mockResolvedValueOnce([{ id: 10 }]);

    await expect(
      service.correct(
        3,
        { status: 'present', ethicsRating: 5, modificationReason: 'no-op' },
        admin(),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(m.repo.save).not.toHaveBeenCalled();
  });
});
