import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { TeacherAttendance } from '../entities/teacher-attendance.entity';
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
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x: TeacherAttendance) => x),
    save: jest.fn((x: TeacherAttendance) => Promise.resolve(x)),
  } as unknown as jest.Mocked<
    Pick<Repository<TeacherAttendance>, 'findOne' | 'create' | 'save'>
  >;
  const query = jest.fn();
  const dataSource = { manager: { query } } as unknown as DataSource;
  const audit = { log: jest.fn() } as unknown as jest.Mocked<
    Pick<AuditService, 'log'>
  >;
  const service = new TeacherAttendanceService(
    repo as unknown as Repository<TeacherAttendance>,
    dataSource,
    audit as unknown as AuditService,
  );
  return { service, repo, query, audit };
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
});
