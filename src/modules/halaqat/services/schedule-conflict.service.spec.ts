import { DataSource } from 'typeorm';
import { ScheduleConflictService } from './schedule-conflict.service';

function makeDataSource(queryResult: unknown[] = []) {
  return {
    manager: {
      query: jest.fn().mockResolvedValue(queryResult),
    },
  } as unknown as DataSource;
}

function makeEm(queryResult: unknown[] = []) {
  return {
    query: jest.fn().mockResolvedValue(queryResult),
  };
}

function makeService(ds = makeDataSource()) {
  return { service: new ScheduleConflictService(ds), ds };
}

const CONFLICT_ROW = {
  day_of_week: 0,
  prayer_slot: 'fajr',
  conflicting_halaqa_id: 19,
  conflicting_halaqa_name: 'حلقة الفجر-2',
};

describe('ScheduleConflictService', () => {
  describe('checkForTeacher()', () => {
    it('returns [] when the DB finds no conflicts', async () => {
      const { service } = makeService(makeDataSource([]));
      const result = await service.checkForTeacher(12, 17, 1);
      expect(result).toEqual([]);
    });

    it('returns conflict details rows from the DB', async () => {
      const { service } = makeService(makeDataSource([CONFLICT_ROW]));
      const result = await service.checkForTeacher(12, 17, 1);
      expect(result).toEqual([CONFLICT_ROW]);
    });

    it('queries with params [teacherUserId, targetHalaqaId, targetHalaqaId, schoolId]', async () => {
      const ds = makeDataSource([]);
      const { service } = makeService(ds);

      await service.checkForTeacher(12, 17, 5);

      expect(ds.manager.query).toHaveBeenCalledWith(
        expect.any(String),
        [12, 17, 17, 5],
      );
    });

    it('passes targetHalaqaId twice so the target halaqa is excluded from conflicts', async () => {
      const ds = makeDataSource([]);
      const { service } = makeService(ds);

      await service.checkForTeacher(12, 17, 1);

      const params: number[] = (ds.manager.query as jest.Mock).mock.calls[0][1];
      const targetIdOccurrences = params.filter((p) => p === 17).length;
      expect(targetIdOccurrences).toBe(2);
    });

    it('uses em.query when an EntityManager is provided', async () => {
      const ds = makeDataSource();
      const { service } = makeService(ds);
      const em = makeEm([CONFLICT_ROW]);

      const result = await service.checkForTeacher(12, 17, 1, em as never);

      expect(result).toEqual([CONFLICT_ROW]);
      expect(em.query).toHaveBeenCalledTimes(1);
      expect(ds.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('checkTeachersForNewSchedule()', () => {
    it('returns [] without querying when no slot has a prayer_slot', async () => {
      const ds = makeDataSource();
      const { service } = makeService(ds);

      const result = await service.checkTeachersForNewSchedule(
        17,
        [{ day_of_week: 0 }, { day_of_week: 2, prayer_slot: null }],
        1,
      );

      expect(result).toEqual([]);
      expect(ds.manager.query).not.toHaveBeenCalled();
    });

    it('returns [] when the DB finds no rows', async () => {
      const { service } = makeService(makeDataSource([]));
      const result = await service.checkTeachersForNewSchedule(
        17,
        [{ day_of_week: 0, prayer_slot: 'fajr' }],
        1,
      );
      expect(result).toEqual([]);
    });

    it('groups multiple DB rows for the same teacher into one TeacherConflict', async () => {
      const rows = [
        { teacher_user_id: 12, teacher_name: 'أحمد', day_of_week: 0, prayer_slot: 'fajr', conflicting_halaqa_id: 19, conflicting_halaqa_name: 'ح-2' },
        { teacher_user_id: 12, teacher_name: 'أحمد', day_of_week: 2, prayer_slot: 'asr',  conflicting_halaqa_id: 20, conflicting_halaqa_name: 'ح-3' },
      ];
      const { service } = makeService(makeDataSource(rows));

      const result = await service.checkTeachersForNewSchedule(
        17,
        [{ day_of_week: 0, prayer_slot: 'fajr' }, { day_of_week: 2, prayer_slot: 'asr' }],
        1,
      );

      expect(result).toHaveLength(1);
      expect(result[0].teacher_user_id).toBe(12);
      expect(result[0].conflicts).toHaveLength(2);
    });

    it('produces separate TeacherConflict entries for different teachers', async () => {
      const rows = [
        { teacher_user_id: 12, teacher_name: 'أحمد', day_of_week: 0, prayer_slot: 'fajr', conflicting_halaqa_id: 19, conflicting_halaqa_name: 'ح-2' },
        { teacher_user_id: 15, teacher_name: 'خالد', day_of_week: 0, prayer_slot: 'fajr', conflicting_halaqa_id: 21, conflicting_halaqa_name: 'ح-4' },
      ];
      const { service } = makeService(makeDataSource(rows));

      const result = await service.checkTeachersForNewSchedule(
        17,
        [{ day_of_week: 0, prayer_slot: 'fajr' }],
        1,
      );

      expect(result).toHaveLength(2);
      const ids = result.map((r) => r.teacher_user_id).sort();
      expect(ids).toEqual([12, 15]);
    });

    it('queries with params [halaqaId, halaqaId, schoolId, ...slot values]', async () => {
      const ds = makeDataSource([]);
      const { service } = makeService(ds);

      await service.checkTeachersForNewSchedule(
        17,
        [{ day_of_week: 0, prayer_slot: 'fajr' }, { day_of_week: 2, prayer_slot: 'asr' }],
        5,
      );

      const params: unknown[] = (ds.manager.query as jest.Mock).mock.calls[0][1];
      expect(params).toEqual([17, 17, 5, 0, 'fajr', 2, 'asr']);
    });

    it('excludes slots without prayer_slot from the query params', async () => {
      const ds = makeDataSource([]);
      const { service } = makeService(ds);

      await service.checkTeachersForNewSchedule(
        17,
        [
          { day_of_week: 0, prayer_slot: 'fajr' },
          { day_of_week: 1 },
          { day_of_week: 2, prayer_slot: null },
          { day_of_week: 3, prayer_slot: 'asr' },
        ],
        1,
      );

      const params: unknown[] = (ds.manager.query as jest.Mock).mock.calls[0][1];
      // [halaqaId=17, halaqaId=17, schoolId=1, 0,'fajr', 3,'asr'] — day 1 and day 2 excluded
      expect(params).toEqual([17, 17, 1, 0, 'fajr', 3, 'asr']);
    });

    it('uses em.query when an EntityManager is provided', async () => {
      const ds = makeDataSource();
      const { service } = makeService(ds);
      const em = makeEm([]);

      await service.checkTeachersForNewSchedule(17, [{ day_of_week: 0, prayer_slot: 'fajr' }], 1, em as never);

      expect(em.query).toHaveBeenCalledTimes(1);
      expect(ds.manager.query).not.toHaveBeenCalled();
    });
  });
});
