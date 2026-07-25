import { NotFoundException } from '@nestjs/common';
import { ApiMessage } from '../../../common/api-message';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { DailyReportService } from './daily-report.service';

/**
 * Orchestration-level tests: the pure math is covered by the logic specs, so
 * here we mock the repositories and assert the service maps attendance/plan/
 * achievement data into the right report shape, persists it, and serves
 * snapshots for past dates.
 */
const DATE = '2026-07-20';
const PAST_DATE = '2020-01-06'; // safely before any current week
const dow = (new Date(`${DATE}T00:00:00Z`).getUTCDay() + 1) % 7;
const actor = { id: 7, schoolId: 1 } as AuthenticatedUser;

interface Captured {
  created: { entity: unknown; data: Record<string, unknown> }[];
  saved: unknown[];
  deleted: unknown[];
}

function build(opts: {
  students: { id: number; name: string }[];
  attendances?: unknown[];
  plans?: unknown[];
  achievements?: unknown[];
  workingDay?: boolean;
  existingHeader?: Record<string, unknown> | null;
  snapshotHeader?: Record<string, unknown> | null;
  snapshotRows?: unknown[];
  studentNames?: { id: number; name: string }[];
  activeHalaqat?: unknown[];
  transactionThrowsOnCall?: number;
}) {
  const halaqa = {
    id: 10,
    schoolId: 1,
    status: 'active',
    hifzWeight: '40',
    nearWeight: '25',
    farWeight: '30',
    ethicsWeight: '5',
  };
  const halaqat = {
    findOne: jest.fn().mockResolvedValue(halaqa),
    find: jest.fn().mockResolvedValue(opts.activeHalaqat ?? [halaqa]),
  };

  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
  ])
    qb[m] = jest.fn(() => qb);
  qb.getRawMany = jest.fn().mockResolvedValue(opts.students);
  const enrollments = { createQueryBuilder: jest.fn(() => qb) };

  const attendances = {
    find: jest.fn().mockResolvedValue(opts.attendances ?? []),
  };
  const plans = { find: jest.fn().mockResolvedValue(opts.plans ?? []) };
  const achievements = {
    find: jest.fn().mockResolvedValue(opts.achievements ?? []),
  };
  const reports = {
    findOne: jest.fn().mockResolvedValue(opts.snapshotHeader ?? null),
  };
  const evaluations = {
    find: jest.fn().mockResolvedValue(opts.snapshotRows ?? []),
  };
  const achievementsService = {
    resolvePositions: jest.fn().mockResolvedValue(new Map()),
  };

  const captured: Captured = { created: [], saved: [], deleted: [] };
  const em = {
    findOne: jest.fn().mockResolvedValue(opts.existingHeader ?? null),
    create: jest.fn((entity: unknown, data: Record<string, unknown>) => {
      const o = { ...data };
      captured.created.push({ entity, data: o });
      return o;
    }),
    save: jest.fn((x: { id?: number }) => {
      captured.saved.push(x);
      if (x && x.id === undefined) x.id = 99;
      return Promise.resolve(x);
    }),
    delete: jest.fn((_e: unknown, where: unknown) => {
      captured.deleted.push(where);
      return Promise.resolve({});
    }),
  };

  let txCall = 0;
  const dataSource = {
    query: jest.fn((sql: string) => {
      if (/school_schedules/.test(sql))
        return Promise.resolve([{ ok: opts.workingDay === false ? 0 : 1 }]);
      if (/FROM students/i.test(sql))
        return Promise.resolve(opts.studentNames ?? []);
      return Promise.resolve([]);
    }),
    transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => {
      txCall++;
      if (opts.transactionThrowsOnCall === txCall)
        return Promise.reject(new Error('boom'));
      return cb(em);
    }),
  };

  const service = new DailyReportService(
    halaqat as never,
    enrollments as never,
    attendances as never,
    plans as never,
    achievements as never,
    reports as never,
    evaluations as never,
    achievementsService as never,
    dataSource as never,
  );
  return { service, captured, halaqat, reports, evaluations, dataSource };
}

const hifzPlan = {
  studentId: 55,
  items: [
    {
      id: 1,
      dayOfWeek: dow,
      trackType: 'Hifz',
      startSurah: 2,
      startVerse: 1,
      endSurah: 2,
      endVerse: 20,
    },
  ],
};
const hifzAchievement = {
  id: 100,
  studentId: 55,
  trackType: 'Hifz',
  recitationMethod: 'full',
  percentageScore: '90',
  approvedAt: new Date('2026-07-20T09:00:00Z'),
  startSurah: 2,
  startVerse: 1,
  endSurah: 2,
  endVerse: 20,
};
const presentFull = {
  students: [{ id: 55, name: 'محمد' }],
  attendances: [
    { studentId: 55, status: 'present', ethicsRating: 5, dailyNote: 'ممتاز' },
  ],
  plans: [hifzPlan],
  achievements: [hifzAchievement],
};

describe('DailyReportService.getDailyReport (live)', () => {
  it('non_working_day → no students', async () => {
    const { service } = build({
      students: [{ id: 55, name: 'A' }],
      workingDay: false,
    });
    const res = await service.getDailyReport(10, DATE, actor);
    expect(res.day_status).toBe('non_working_day');
    expect(res.source).toBe('live');
    expect(res.students).toEqual([]);
  });

  it('present student, fully-achieved single-track plan', async () => {
    const { service } = build(presentFull);
    const res = await service.getDailyReport(10, DATE, actor);
    const row = res.students[0];
    expect(row.hifz_score).toBeCloseTo(85.5, 2);
    expect(row.total_score).toBeCloseTo(90.5, 2);
    expect(row.plan_completion_rate).toBeCloseTo(100, 2);
    expect(row.system_alerts.map((a) => a.code)).toContain(
      'WEIGHTS_REDISTRIBUTED',
    );
  });

  it('missing attendance → partial + null total', async () => {
    const { service } = build({ ...presentFull, attendances: [] });
    const res = await service.getDailyReport(10, DATE, actor);
    expect(res.report_status).toBe('partial');
    expect(res.students[0].total_score).toBeNull();
    expect(res.students[0].system_alerts.map((a) => a.code)).toContain(
      'MISSING_ATTENDANCE',
    );
  });

  it('absent → zeros', async () => {
    const { service } = build({
      ...presentFull,
      attendances: [{ studentId: 55, status: 'absent', ethicsRating: 5 }],
    });
    const res = await service.getDailyReport(10, DATE, actor);
    expect(res.students[0].total_score).toBe(0);
  });

  it('404 for a non-member student detail', async () => {
    const { service } = build({ students: [] });
    await expect(
      service.getStudentDetail(10, DATE, 999, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DailyReportService — snapshot read (past dates)', () => {
  it('serves a stored snapshot with source=snapshot', async () => {
    const { service, reports } = build({
      students: [],
      snapshotHeader: {
        id: 5,
        halaqaId: 10,
        reportDate: PAST_DATE,
        dayStatus: 'working_day',
        reportStatus: 'complete',
        hifzWeight: '40',
        nearWeight: '25',
        farWeight: '30',
        ethicsWeight: '5',
      },
      snapshotRows: [
        {
          studentId: 55,
          attendanceStatus: 'present',
          hifzScore: '36.00',
          nearScore: '20.00',
          farScore: '25.50',
          ethicsScore: '5.00',
          overallPlanCompletionRate: '92.50',
          totalScore: '86.50',
          teacherNote: 'note',
          systemAlerts: [],
        },
      ],
      studentNames: [{ id: 55, name: 'محمد' }],
    });
    const res = await service.getDailyReport(10, PAST_DATE, actor);
    expect(reports.findOne).toHaveBeenCalled();
    expect(res.source).toBe('snapshot');
    expect(res.students[0]).toMatchObject({
      student_id: 55,
      student_name: 'محمد',
      total_score: 86.5,
      plan_completion_rate: 92.5,
    });
  });

  it('past date with no snapshot falls back to a live compute', async () => {
    const { service } = build({ students: [], snapshotHeader: null });
    const res = await service.getDailyReport(10, PAST_DATE, actor);
    expect(res.source).toBe('live');
  });
});

describe('DailyReportService.persistDay', () => {
  it('creates a working-day header and one student row', async () => {
    const { service, captured } = build(presentFull);
    await service.persistDay(
      {
        id: 10,
        schoolId: 1,
        hifzWeight: '40',
        nearWeight: '25',
        farWeight: '30',
        ethicsWeight: '5',
      } as never,
      DATE,
      actor.id,
      'because',
    );
    const header = captured.created.find(
      (c) => c.data.dayStatus === 'working_day',
    );
    expect(header).toBeDefined();
    expect(header?.data.generatedBy).toBe(7);
    const evalRow = captured.created.find(
      (c) => c.data.totalScore !== undefined,
    );
    expect(evalRow?.data.attendanceStatus).toBe('present');
  });

  it('non-working day writes header only, no student rows', async () => {
    const { service, captured } = build({
      students: [{ id: 55, name: 'A' }],
      workingDay: false,
    });
    await service.persistDay(
      {
        id: 10,
        schoolId: 1,
        hifzWeight: '40',
        nearWeight: '25',
        farWeight: '30',
        ethicsWeight: '5',
      } as never,
      DATE,
      null,
      null,
    );
    expect(
      captured.created.some((c) => c.data.dayStatus === 'non_working_day'),
    ).toBe(true);
    expect(captured.created.some((c) => c.data.totalScore !== undefined)).toBe(
      false,
    );
  });

  it('existing report is replaced in place (recalculated_at set, rows deleted)', async () => {
    const { service, captured } = build({
      ...presentFull,
      existingHeader: { id: 5, halaqaId: 10 },
    });
    await service.persistDay(
      {
        id: 10,
        schoolId: 1,
        hifzWeight: '40',
        nearWeight: '25',
        farWeight: '30',
        ethicsWeight: '5',
      } as never,
      DATE,
      actor.id,
      'fix',
    );
    // header object mutated in place with recalculated fields
    const savedHeader = captured.saved.find(
      (s) => (s as { id?: number }).id === 5,
    ) as Record<string, unknown>;
    expect(savedHeader.recalculatedAt).toBeInstanceOf(Date);
    expect(savedHeader.recalculationReason).toBe('fix');
    expect(captured.deleted.length).toBeGreaterThan(0);
  });
});

describe('DailyReportService — recalculate + weekly job', () => {
  it('recalculateDay loads the halaqa and returns a message', async () => {
    const { service, halaqat } = build(presentFull);
    const res = await service.recalculateDay(10, DATE, 'reason', actor);
    expect(halaqat.findOne).toHaveBeenCalled();
    expect(res).toBeInstanceOf(ApiMessage);
  });

  it('persistWeek isolates a failing (halaqa, day) and keeps going', async () => {
    const { service } = build({
      ...presentFull,
      activeHalaqat: [
        {
          id: 10,
          schoolId: 1,
          status: 'active',
          hifzWeight: '40',
          nearWeight: '25',
          farWeight: '30',
          ethicsWeight: '5',
        },
      ],
      transactionThrowsOnCall: 2, // second of the 7 days throws
    });
    const result = await service.persistWeek('2026-07-18');
    expect(result.halaqat).toBe(1);
    expect(result.failures).toBe(1);
  });
});
