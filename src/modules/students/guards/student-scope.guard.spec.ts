import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Student } from '../entities/student.entity';
import { StudentScopeGuard } from './student-scope.guard';

const BASE_STUDENT: Student = {
  id: 10,
  schoolId: 1,
  name: 'محمد',
  idNumber: null,
  gender: 'male',
  dob: null,
  joinDate: new Date(),
  status: 'active',
  dailyHifzPagesCapacity: 1,
  dailyNearPagesCapacity: 5,
  dailyFarPagesCapacity: 10,
  memorizationDirection: 'descending',
  notes: null,
  memorizedAyat: null,
  photoUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  school: {} as never,
};

function makeContext(
  user: AuthenticatedUser,
  params: Record<string, string> = { id: '10' },
) {
  const req = { user, params, student: undefined as Student | undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as unknown as ExecutionContext & { req: typeof req };
}

function makeDataSource(student: Student | null, queryRows: unknown[] = []) {
  return {
    manager: {
      findOne: jest.fn().mockResolvedValue(student),
      query: jest.fn().mockResolvedValue(queryRows),
    },
  } as unknown as DataSource;
}

function makeGuard(ds: DataSource) {
  return new StudentScopeGuard(ds);
}

const PRINCIPAL: AuthenticatedUser = {
  id: 1,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};
const TEACHER: AuthenticatedUser = {
  id: 5,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 50 }],
};
const PARENT: AuthenticatedUser = {
  id: 9,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'parent', level: 10 }],
};

describe('StudentScopeGuard', () => {
  it('allows principal and sets req.student', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(BASE_STUDENT));
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(ctx.req.student).toBe(BASE_STUDENT);
  });

  it('throws 404 (not 403) when student is cross-school', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource({ ...BASE_STUDENT, schoolId: 99 }));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws 404 when student does not exist', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(null));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws 404 when teacher has no halaqa with this student', async () => {
    const ctx = makeContext(TEACHER);
    const guard = makeGuard(makeDataSource(BASE_STUDENT, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows teacher when they have a halaqa with this student', async () => {
    const ctx = makeContext(TEACHER);
    const ds = makeDataSource(BASE_STUDENT);
    (ds.manager.query as jest.Mock).mockResolvedValue([{ 1: 1 }]);
    const guard = makeGuard(ds);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('throws 404 when parent is not linked to this student', async () => {
    const ctx = makeContext(PARENT);
    const guard = makeGuard(makeDataSource(BASE_STUDENT, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows parent when they are linked to this student', async () => {
    const ctx = makeContext(PARENT);
    const ds = makeDataSource(BASE_STUDENT);
    (ds.manager.query as jest.Mock).mockResolvedValue([{ 1: 1 }]);
    const guard = makeGuard(ds);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});
