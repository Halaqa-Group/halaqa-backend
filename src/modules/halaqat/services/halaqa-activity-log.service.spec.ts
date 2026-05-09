import { Repository } from 'typeorm';
import { ListActivityQuery } from '../dto/list-activity.query';
import { HalaqaActivityLog } from '../entities/halaqa-activity-log.entity';
import { HalaqaActivityLogService, LogParams } from './halaqa-activity-log.service';

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeRepo() {
  return {
    create: jest.fn().mockImplementation((d: unknown) => ({ ...d as object })),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEm(repo = makeRepo()) {
  return {
    getRepository: jest.fn().mockReturnValue(repo),
    _repo: repo,
  };
}

function makeDataSource(rows: unknown[] = [], total = 0) {
  return {
    manager: {
      query: jest.fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ total: String(total) }]),
    },
  } as never;
}

function makeService(
  repo = makeRepo(),
  ds: ReturnType<typeof makeDataSource> = makeDataSource(),
) {
  return {
    service: new HalaqaActivityLogService(
      repo as unknown as Repository<HalaqaActivityLog>,
      ds as never,
    ),
    repo,
    ds,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PARAMS: LogParams = {
  schoolId: 1,
  halaqaId: 17,
  action: 'teacher_assigned',
  actorUserId: 5,
  targetUserId: 12,
};

const LOG_ROW = {
  id: '1', action: 'student_enrolled',
  actor_user_id: 12, actor_name: 'أحمد المعلم',
  target_user_id: null, target_user_name: null,
  target_student_id: 42, target_student_name: 'محمد علي',
  from_halaqa_id: null, to_halaqa_id: null,
  metadata: null, notes: null, created_at: new Date('2026-05-09T08:00:00Z'),
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('HalaqaActivityLogService', () => {
  // ── log() ─────────────────────────────────────────────────────────────────────
  describe('log()', () => {
    it('calls create() with all provided params mapped to entity fields', async () => {
      const { service, repo } = makeService();
      const params: LogParams = {
        ...BASE_PARAMS,
        targetStudentId: 42,
        fromHalaqaId: 10,
        toHalaqaId: 11,
        metadata: { reason: 'test' },
        notes: 'some note',
      };

      await service.log(params);

      expect(repo.create).toHaveBeenCalledWith({
        schoolId: 1,
        halaqaId: 17,
        action: 'teacher_assigned',
        actorUserId: 5,
        targetUserId: 12,
        targetStudentId: 42,
        fromHalaqaId: 10,
        toHalaqaId: 11,
        metadata: { reason: 'test' },
        notes: 'some note',
      });
    });

    it('maps omitted optional fields to null', async () => {
      const { service, repo } = makeService();

      await service.log({ schoolId: 1, action: 'halaqa_created' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          halaqaId: null,
          actorUserId: null,
          targetUserId: null,
          targetStudentId: null,
          fromHalaqaId: null,
          toHalaqaId: null,
          metadata: null,
          notes: null,
        }),
      );
    });

    it('calls save() with the entity returned by create()', async () => {
      const repo = makeRepo();
      const fakeEntity = { schoolId: 1, action: 'halaqa_created', _tag: 'entity' };
      repo.create.mockReturnValue(fakeEntity);
      const { service } = makeService(repo);

      await service.log({ schoolId: 1, action: 'halaqa_created' });

      expect(repo.save).toHaveBeenCalledWith(fakeEntity);
    });

    it('uses the injected repo when no em is provided', async () => {
      const { service, repo } = makeService();

      await service.log(BASE_PARAMS);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('uses em.getRepository() when em is provided, not the injected repo', async () => {
      const { service, repo: injectedRepo } = makeService();
      const emRepo = makeRepo();
      const em = makeEm(emRepo);

      await service.log(BASE_PARAMS, em as never);

      expect(em.getRepository).toHaveBeenCalledWith(HalaqaActivityLog);
      expect(emRepo.create).toHaveBeenCalledTimes(1);
      expect(emRepo.save).toHaveBeenCalledTimes(1);
      expect(injectedRepo.create).not.toHaveBeenCalled();
      expect(injectedRepo.save).not.toHaveBeenCalled();
    });

    it('passes explicitly-null optional fields through as null (not undefined)', async () => {
      const { service, repo } = makeService();

      await service.log({ ...BASE_PARAMS, halaqaId: null, metadata: null, notes: null });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ halaqaId: null, metadata: null, notes: null }),
      );
    });
  });

  // ── listForHalaqa() ───────────────────────────────────────────────────────────
  describe('listForHalaqa()', () => {
    it('returns items and total for a halaqa', async () => {
      const { service } = makeService(makeRepo(), makeDataSource([LOG_ROW], 1));
      const result = await service.listForHalaqa(17, 10, {});
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns empty list with zero total when no logs', async () => {
      const { service } = makeService(makeRepo(), makeDataSource([], 0));
      const result = await service.listForHalaqa(17, 10, {});
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('defaults page=1 and limit=20, OFFSET=0', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, {});
      const [, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(params[params.length - 2]).toBe(20);  // limit
      expect(params[params.length - 1]).toBe(0);   // offset
    });

    it('computes correct LIMIT and OFFSET for page 3, limit 10', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      const query: ListActivityQuery = { page: 3, limit: 10 };
      await service.listForHalaqa(17, 10, query);
      const [, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(params[params.length - 2]).toBe(10);  // limit
      expect(params[params.length - 1]).toBe(20);  // offset = (3-1)*10
    });

    it('scopes query to halaqaId and schoolId', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, {});
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('al.halaqa_id = ?');
      expect(sql).toContain('al.school_id = ?');
      expect(params).toContain(17);
      expect(params).toContain(10);
    });

    it('applies action filter when provided', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, { action: 'student_enrolled' });
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('al.action = ?');
      expect(params).toContain('student_enrolled');
    });

    it('omits action clause when not provided', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, {});
      const sql: string = (ds.manager.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).not.toContain('al.action = ?');
    });

    it('applies from_date filter', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, { from_date: '2026-05-01' });
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('DATE(al.created_at) >=');
      expect(params).toContain('2026-05-01');
    });

    it('applies to_date filter', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, { to_date: '2026-05-31' });
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('DATE(al.created_at) <=');
      expect(params).toContain('2026-05-31');
    });

    it('applies both date filters together', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, { from_date: '2026-05-01', to_date: '2026-05-31' });
      const sql: string = (ds.manager.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('DATE(al.created_at) >=');
      expect(sql).toContain('DATE(al.created_at) <=');
    });

    it('includes LEFT JOINs for actor, target user, and student names', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, {});
      const sql: string = (ds.manager.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('LEFT JOIN users actor');
      expect(sql).toContain('LEFT JOIN students');
    });

    it('orders results by created_at DESC', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, {});
      const sql: string = (ds.manager.query as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY al.created_at DESC');
    });

    it('sends the same WHERE conditions to the count query', async () => {
      const ds = makeDataSource([], 0);
      const { service } = makeService(makeRepo(), ds);
      await service.listForHalaqa(17, 10, { action: 'acting_started' });
      const [countSql, countParams] = (ds.manager.query as jest.Mock).mock.calls[1] as [string, unknown[]];
      expect(countSql).toContain('COUNT(*)');
      expect(countSql).toContain('al.action = ?');
      expect(countParams).toContain('acting_started');
    });

    it('parses total as a number (MySQL returns COUNT as string)', async () => {
      const ds = {
        manager: {
          query: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: '7' }]),
        },
      } as never;
      const { service } = makeService(makeRepo(), ds);
      const result = await service.listForHalaqa(17, 10, {});
      expect(result.total).toBe(7);
      expect(typeof result.total).toBe('number');
    });
  });
});
