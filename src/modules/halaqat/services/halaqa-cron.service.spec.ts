import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqaCronService } from './halaqa-cron.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PENDING_ROW = {
  id: 55,
  halaqa_id: 17,
  teacher_user_id: 12,
  school_id: 10,
};
const NO_PRIMARY_ROW = { id: 17, school_id: 10, name: 'حلقة الفجر للحفظ' };

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<{ update: jest.Mock }> = {}) {
  return {
    update: overrides.update ?? jest.fn().mockResolvedValue({ affected: 1 }),
  } as never as jest.Mocked<{ update: jest.Mock }>;
}

function makeDataSource(queryRows: unknown[] = []) {
  return {
    manager: { query: jest.fn().mockResolvedValue(queryRows) },
  } as never;
}

function makeActivityLog() {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeNotifications() {
  return { notifyRole: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeService(
  overrides: {
    repo?: ReturnType<typeof makeRepo>;
    ds?: ReturnType<typeof makeDataSource>;
    activityLog?: ReturnType<typeof makeActivityLog>;
    notifications?: ReturnType<typeof makeNotifications>;
  } = {},
) {
  return new HalaqaCronService(
    (overrides.repo ??
      makeRepo()) as never as import('typeorm').Repository<HalaqaTeacher>,
    overrides.ds ?? makeDataSource(),
    overrides.activityLog ?? makeActivityLog(),
    overrides.notifications ?? makeNotifications(),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('HalaqaCronService', () => {
  // ── activateScheduledActing ────────────────────────────────────────────────
  describe('activateScheduledActing()', () => {
    it('does nothing when no pending rows', async () => {
      const repo = makeRepo();
      const activityLog = makeActivityLog();
      const svc = makeService({ repo, activityLog, ds: makeDataSource([]) });
      await svc.activateScheduledActing();
      expect(repo.update).not.toHaveBeenCalled();
      expect(activityLog.log).not.toHaveBeenCalled();
    });

    it('sets actingAsPrimary=true for each pending row', async () => {
      const repo = makeRepo();
      const svc = makeService({ repo, ds: makeDataSource([PENDING_ROW]) });
      await svc.activateScheduledActing();
      expect(repo.update).toHaveBeenCalledWith(55, { actingAsPrimary: true });
    });

    it('processes multiple pending rows', async () => {
      const repo = makeRepo();
      const rows = [
        PENDING_ROW,
        { ...PENDING_ROW, id: 56, teacher_user_id: 13 },
      ];
      const svc = makeService({ repo, ds: makeDataSource(rows) });
      await svc.activateScheduledActing();
      expect(repo.update).toHaveBeenCalledTimes(2);
    });

    it('logs acting_started for each activated row', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({
        activityLog,
        ds: makeDataSource([PENDING_ROW]),
      });
      await svc.activateScheduledActing();
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'acting_started',
          halaqaId: 17,
          targetUserId: 12,
          schoolId: 10,
          actorUserId: null,
        }),
      );
    });

    it('queries with correct conditions (acting_as_primary=0, end_date IS NULL, date check)', async () => {
      const ds = makeDataSource([]);
      const svc = makeService({ ds });
      await svc.activateScheduledActing();
      const sql: string = (ds.manager.query as jest.Mock).mock
        .calls[0][0] as string;
      expect(sql).toContain('acting_as_primary = 0');
      expect(sql).toContain('CURDATE()');
      expect(sql).toContain('end_date IS NULL');
    });
  });

  // ── notifyNoPrimaryTeacher ─────────────────────────────────────────────────
  describe('notifyNoPrimaryTeacher()', () => {
    it('does nothing when all halaqat have a primary teacher', async () => {
      const notifications = makeNotifications();
      const svc = makeService({ notifications, ds: makeDataSource([]) });
      await svc.notifyNoPrimaryTeacher();
      expect(notifications.notifyRole).not.toHaveBeenCalled();
    });

    it('notifies vice_principal for each halaqa without a primary teacher', async () => {
      const notifications = makeNotifications();
      const svc = makeService({
        notifications,
        ds: makeDataSource([NO_PRIMARY_ROW]),
      });
      await svc.notifyNoPrimaryTeacher();
      expect(notifications.notifyRole).toHaveBeenCalledWith(
        10,
        'vice_principal',
        expect.objectContaining({
          type: 'halaqa.no_primary_teacher',
          halaqaId: 17,
          halaqaName: 'حلقة الفجر للحفظ',
        }),
      );
    });

    it('notifies once per halaqa for multiple missing-primary halaqat', async () => {
      const notifications = makeNotifications();
      const rows = [
        NO_PRIMARY_ROW,
        { id: 18, school_id: 10, name: 'حلقة العشاء' },
      ];
      const svc = makeService({ notifications, ds: makeDataSource(rows) });
      await svc.notifyNoPrimaryTeacher();
      expect(notifications.notifyRole).toHaveBeenCalledTimes(2);
    });

    it('queries only active non-deleted halaqat using NOT EXISTS subquery', async () => {
      const ds = makeDataSource([]);
      const svc = makeService({ ds });
      await svc.notifyNoPrimaryTeacher();
      const sql: string = (ds.manager.query as jest.Mock).mock
        .calls[0][0] as string;
      expect(sql).toContain("status = 'active'");
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('acting_as_primary');
    });
  });
});
