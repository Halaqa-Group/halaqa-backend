import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { Halaqa } from '../entities/halaqa.entity';
import { HalaqaAccessGuard, HalaqaEditAccessGuard } from './halaqa-scope.guard';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_HALAQA = { id: 17, schoolId: 10, status: 'active' } as Halaqa;
const ARCHIVED_HALAQA = { id: 17, schoolId: 10, status: 'archived' } as Halaqa;

const PRINCIPAL: AuthenticatedUser = {
  id: 1,
  schoolId: 10,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};
const VICE_PRINCIPAL: AuthenticatedUser = {
  id: 2,
  schoolId: 10,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'vice_principal', level: 90 }],
};
const SUPERVISOR: AuthenticatedUser = {
  id: 3,
  schoolId: 10,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'supervisor', level: 70 }],
};
const TEACHER: AuthenticatedUser = {
  id: 4,
  schoolId: 10,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 50 }],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(
  user: AuthenticatedUser,
  params: Record<string, string> = { id: '17' },
) {
  const req = { user, params, halaqa: undefined as Halaqa | undefined };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as unknown as ExecutionContext & { req: typeof req };
}

function makeDataSource(halaqa: Halaqa | null, queryRows: unknown[] = []) {
  return {
    manager: {
      findOne: jest.fn().mockResolvedValue(halaqa),
      query: jest.fn().mockResolvedValue(queryRows),
    },
  } as unknown as DataSource;
}

// ─── HalaqaAccessGuard (read, withDeleted: true) ──────────────────────────────

describe('HalaqaAccessGuard', () => {
  function makeGuard(ds: DataSource) {
    return new HalaqaAccessGuard(ds);
  }

  it('passes and sets req.halaqa for principal', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(BASE_HALAQA));
    expect(await guard.canActivate(ctx as unknown as ExecutionContext)).toBe(
      true,
    );
    expect(ctx.req.halaqa).toBe(BASE_HALAQA);
  });

  it('passes and sets req.halaqa for vice_principal', async () => {
    const ctx = makeContext(VICE_PRINCIPAL);
    const guard = makeGuard(makeDataSource(BASE_HALAQA));
    expect(await guard.canActivate(ctx as unknown as ExecutionContext)).toBe(
      true,
    );
    expect(ctx.req.halaqa).toBe(BASE_HALAQA);
  });

  it('throws 404 when halaqa not found in school', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(null));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows reading an archived halaqa (withDeleted: true)', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(ARCHIVED_HALAQA));
    expect(await guard.canActivate(ctx as unknown as ExecutionContext)).toBe(
      true,
    );
    expect(ctx.req.halaqa).toBe(ARCHIVED_HALAQA);
  });

  it('passes for supervisor with valid assignment', async () => {
    const ctx = makeContext(SUPERVISOR);
    const ds = makeDataSource(BASE_HALAQA, [{ 1: 1 }]);
    expect(
      await makeGuard(ds).canActivate(ctx as unknown as ExecutionContext),
    ).toBe(true);
    expect(ctx.req.halaqa).toBe(BASE_HALAQA);
    expect(ds.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('supervisor_halaqat'),
      [17, SUPERVISOR.id],
    );
  });

  it('throws 404 (not 403) for supervisor with no assignment — BR-HLQ-01', async () => {
    const ctx = makeContext(SUPERVISOR);
    const guard = makeGuard(makeDataSource(BASE_HALAQA, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes for teacher with active assignment', async () => {
    const ctx = makeContext(TEACHER);
    const ds = makeDataSource(BASE_HALAQA, [{ 1: 1 }]);
    expect(
      await makeGuard(ds).canActivate(ctx as unknown as ExecutionContext),
    ).toBe(true);
    expect(ctx.req.halaqa).toBe(BASE_HALAQA);
    expect(ds.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('halaqa_teachers'),
      [17, TEACHER.id],
    );
  });

  it('throws 404 (not 403) for teacher with no active assignment — BR-HLQ-01', async () => {
    const ctx = makeContext(TEACHER);
    const guard = makeGuard(makeDataSource(BASE_HALAQA, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('skips check and returns true when no :id param', async () => {
    const ctx = makeContext(PRINCIPAL, {});
    const ds = makeDataSource(null);
    expect(
      await makeGuard(ds).canActivate(ctx as unknown as ExecutionContext),
    ).toBe(true);
    expect(ds.manager.findOne).not.toHaveBeenCalled();
  });
});

// ─── HalaqaEditAccessGuard (write, withDeleted: false) ────────────────────────

describe('HalaqaEditAccessGuard', () => {
  function makeGuard(ds: DataSource) {
    return new HalaqaEditAccessGuard(ds);
  }

  it('passes for principal on active halaqa', async () => {
    const ctx = makeContext(PRINCIPAL);
    const guard = makeGuard(makeDataSource(BASE_HALAQA));
    expect(await guard.canActivate(ctx as unknown as ExecutionContext)).toBe(
      true,
    );
  });

  it('throws 404 for archived halaqa (withDeleted: false)', async () => {
    const ctx = makeContext(PRINCIPAL);
    // withDeleted: false → TypeORM returns null for soft-deleted rows
    const guard = makeGuard(makeDataSource(null));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes for supervisor with active assignment on active halaqa', async () => {
    const ctx = makeContext(SUPERVISOR);
    const ds = makeDataSource(BASE_HALAQA, [{ 1: 1 }]);
    expect(
      await makeGuard(ds).canActivate(ctx as unknown as ExecutionContext),
    ).toBe(true);
  });

  it('throws 404 for supervisor with no assignment', async () => {
    const ctx = makeContext(SUPERVISOR);
    const guard = makeGuard(makeDataSource(BASE_HALAQA, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes for teacher with active assignment', async () => {
    const ctx = makeContext(TEACHER);
    const ds = makeDataSource(BASE_HALAQA, [{ 1: 1 }]);
    expect(
      await makeGuard(ds).canActivate(ctx as unknown as ExecutionContext),
    ).toBe(true);
  });

  it('throws 404 for teacher with no active assignment', async () => {
    const ctx = makeContext(TEACHER);
    const guard = makeGuard(makeDataSource(BASE_HALAQA, []));
    await expect(
      guard.canActivate(ctx as unknown as ExecutionContext),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes withDeleted:false flag to findOne', async () => {
    const ctx = makeContext(PRINCIPAL);
    const ds = makeDataSource(BASE_HALAQA);
    await makeGuard(ds).canActivate(ctx);
    expect(ds.manager.findOne).toHaveBeenCalledWith(
      Halaqa,
      expect.objectContaining({ withDeleted: false }),
    );
  });
});
