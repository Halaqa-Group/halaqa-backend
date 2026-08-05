import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { TeacherAttendance } from '../entities/teacher-attendance.entity';
import { AttendanceSeedService } from './attendance-seed.service';
import {
  SyncTeacherEntry,
  TeacherAttendanceService,
} from './teacher-attendance.service';

const admin = (id = 1, schoolId = 1): AuthenticatedUser => ({
  id,
  schoolId,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 90 }],
});

const teacher = (id = 7, schoolId = 1): AuthenticatedUser => ({
  id,
  schoolId,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 20 }],
});

const entry = (over: Partial<SyncTeacherEntry> = {}): SyncTeacherEntry => ({
  userId: 7,
  date: '2026-07-07',
  status: 'absent',
  ...over,
});

function build() {
  // Chainable no-op builder — the list tests here assert the seeding side
  // effect, not the SQL, so every builder method returns the builder itself.
  const qb: Record<string, jest.Mock> = {
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  for (const m of [
    'withDeleted',
    'leftJoinAndSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x: TeacherAttendance) => x),
    save: jest.fn((x: TeacherAttendance) => Promise.resolve(x)),
    createQueryBuilder: jest.fn(() => qb),
  } as unknown as jest.Mocked<
    Pick<
      Repository<TeacherAttendance>,
      'findOne' | 'create' | 'save' | 'createQueryBuilder'
    >
  >;
  const query = jest.fn();
  const dataSource = { manager: { query } } as unknown as DataSource;
  const audit = { log: jest.fn() } as unknown as jest.Mocked<
    Pick<AuditService, 'log'>
  >;
  const seed = {
    today: jest.fn<Promise<string>, []>().mockResolvedValue('2026-07-07'),
    seedStaffForDate: jest.fn<Promise<number>, [string, number?]>(),
  };
  const service = new TeacherAttendanceService(
    repo as unknown as Repository<TeacherAttendance>,
    dataSource,
    audit as unknown as AuditService,
    seed as unknown as AttendanceSeedService,
  );
  return { service, repo, query, audit, seed };
}

describe('TeacherAttendanceService', () => {
  it('rejects non-admin recorders', async () => {
    const { service } = build();
    await expect(service.bulkSync([entry()], teacher())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('records accessible staff and forbids the rest', async () => {
    const { service, repo, query } = build();
    query.mockResolvedValueOnce([{ id: 7 }]); // only user 7 accessible
    repo.findOne.mockResolvedValue(null);

    const result = await service.bulkSync(
      [entry({ userId: 7 }), entry({ userId: 8 })],
      admin(),
    );

    expect(result.created).toBe(1);
    expect(result.forbidden).toBe(1);
  });

  it('404s correcting a missing row', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.correct(
        1,
        { status: 'absent', modificationReason: 'x' },
        admin(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  describe('list top-up', () => {
    it('seeds today for the school when the window covers today', async () => {
      const { service, seed } = build();
      await service.list({ date: '2026-07-07' }, admin(1, 4));
      expect(seed.seedStaffForDate).toHaveBeenCalledWith('2026-07-07', 4);
    });

    it('seeds today when no date filter is given', async () => {
      const { service, seed } = build();
      await service.list({}, admin(1, 4));
      expect(seed.seedStaffForDate).toHaveBeenCalledWith('2026-07-07', 4);
    });

    it('seeds today for an open range that still covers it', async () => {
      const { service, seed } = build();
      await service.list({ from: '2026-07-01' }, admin(1, 4));
      expect(seed.seedStaffForDate).toHaveBeenCalledWith('2026-07-07', 4);
    });

    it('skips seeding for a past-only window', async () => {
      const { service, seed } = build();
      await service.list({ from: '2026-06-01', to: '2026-06-30' }, admin());
      expect(seed.seedStaffForDate).not.toHaveBeenCalled();
    });

    it('still returns rows when the top-up fails', async () => {
      const { service, seed } = build();
      seed.seedStaffForDate.mockRejectedValueOnce(new Error('db down'));
      await expect(service.list({}, admin())).resolves.toMatchObject({
        total: 0,
      });
    });
  });
});
