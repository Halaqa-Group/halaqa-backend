import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

interface RepoMock {
  create: jest.Mock;
  save: jest.Mock;
}

function makeRepo(): RepoMock {
  return {
    create: jest.fn().mockImplementation(() => ({}) as AuditLog),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(repo: RepoMock): AuditService {
  return new AuditService(repo as unknown as Repository<AuditLog>);
}

const ACTOR: AuthenticatedUser = {
  id: 5,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [
    { slug: 'principal', level: 100 },
    { slug: 'teacher', level: 50 },
  ],
};

describe('AuditService', () => {
  let repo: RepoMock;
  let service: AuditService;

  beforeEach(() => {
    repo = makeRepo();
    service = makeService(repo);
  });

  it('persists actor id, first role slug, school, action, entity type, and stringified entity id', async () => {
    await service.log({
      actor: ACTOR,
      action: 'user.update',
      entityType: 'user',
      entityId: 42,
      ip: '1.2.3.4',
      userAgent: 'curl/8',
    });

    const saved = repo.save.mock.calls[0][0] as AuditLog;
    expect(saved.actorUserId).toBe(5);
    expect(saved.actorRole).toBe('principal');
    expect(saved.schoolId).toBe(1);
    expect(saved.action).toBe('user.update');
    expect(saved.entityType).toBe('user');
    expect(saved.entityId).toBe('42');
    expect(saved.ipAddress).toBe('1.2.3.4');
    expect(saved.userAgent).toBe('curl/8');
  });

  it('persists null actor fields when called without an authenticated actor', async () => {
    await service.log({
      actor: null,
      action: 'auth.login.failed',
      entityType: 'auth',
    });

    const saved = repo.save.mock.calls[0][0] as AuditLog;
    expect(saved.actorUserId).toBeNull();
    expect(saved.actorRole).toBeNull();
    expect(saved.schoolId).toBeNull();
    expect(saved.entityId).toBeNull();
  });

  it('preserves oldValues/newValues diffs when supplied', async () => {
    await service.log({
      actor: ACTOR,
      action: 'user.update',
      entityType: 'user',
      entityId: 7,
      oldValues: { status: 'active' },
      newValues: { status: 'inactive' },
    });

    const saved = repo.save.mock.calls[0][0] as AuditLog;
    expect(saved.oldValues).toEqual({ status: 'active' });
    expect(saved.newValues).toEqual({ status: 'inactive' });
  });

  it('swallows persistence errors and logs them — a failed audit must never break the caller', async () => {
    repo.save.mockRejectedValueOnce(new Error('db down'));
    const errSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.log({
        actor: ACTOR,
        action: 'user.create',
        entityType: 'user',
        entityId: 99,
      }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0][0]).toContain('user.create');
    errSpy.mockRestore();
  });
});
