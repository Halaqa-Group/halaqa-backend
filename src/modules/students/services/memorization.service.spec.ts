import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import { countBits, toBitmap } from '../../../quran/quran-bitmap';
import { MemorizationJob } from '../entities/memorization-job.entity';
import { Student } from '../entities/student.entity';
import { MemorizationService } from './memorization.service';
import { StudentsService } from './students.service';

const actor = (): AuthenticatedUser =>
  ({ id: 1, schoolId: 1, roles: [{ slug: 'teacher' }] } as unknown as AuthenticatedUser);

const makeStudents = () => ({ update: jest.fn().mockResolvedValue(undefined) });
const makeJobs = () => ({});
const makeStudentsService = (student: Partial<Student> = {}) =>
  ({
    findInScopeOrFail: jest.fn().mockResolvedValue({ id: 42, schoolId: 1, memorizedAyat: null, ...student }),
  } as unknown as StudentsService);

/** dataSource.query mock that dispatches on the SQL text. */
const makeDs = (handlers: { ranges?: unknown[]; onQuery?: (sql: string, params?: unknown[]) => unknown }) => {
  const query = jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
    if (handlers.onQuery) {
      const r = handlers.onQuery(sql, params);
      if (r !== undefined) return Promise.resolve(r);
    }
    if (/FROM achievements/i.test(sql)) return Promise.resolve(handlers.ranges ?? []);
    return Promise.resolve([]);
  });
  return { query } as unknown as DataSource & { query: jest.Mock };
};

const make = (opts: {
  students?: ReturnType<typeof makeStudents>;
  studentsService?: StudentsService;
  ds?: DataSource;
}) => {
  const students = opts.students ?? makeStudents();
  const svc = new MemorizationService(
    students as unknown as Repository<Student>,
    makeJobs() as unknown as Repository<MemorizationJob>,
    opts.ds ?? makeDs({}),
    opts.studentsService ?? makeStudentsService(),
    new QuranRangeValidator(),
  );
  return { svc, students };
};

describe('MemorizationService', () => {
  describe('recompute()', () => {
    it('rebuilds the bitmap from the union of approved Hifz ranges', async () => {
      const students = makeStudents();
      const ds = makeDs({
        ranges: [
          { startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 },
          { startSurah: 2, startVerse: 1, endSurah: 2, endVerse: 5 },
          { startSurah: 1, startVerse: 3, endSurah: 1, endVerse: 5 }, // overlap — union, not sum
        ],
      });
      const { svc } = make({ students, ds });

      await svc.recompute(42);

      expect(students.update).toHaveBeenCalledTimes(1);
      const buf = (students.update.mock.calls[0][1] as { memorizedAyat: Buffer }).memorizedAyat;
      expect(countBits(buf)).toBe(12); // 7 + 5, overlap counted once
    });

    it('writes an empty bitmap when there are no approved achievements', async () => {
      const students = makeStudents();
      const { svc } = make({ students, ds: makeDs({ ranges: [] }) });

      await svc.recompute(42);

      const buf = (students.update.mock.calls[0][1] as { memorizedAyat: Buffer }).memorizedAyat;
      expect(countBits(buf)).toBe(0);
    });
  });

  describe('edit()', () => {
    it('applies set then clear onto the current bitmap', async () => {
      const students = makeStudents();
      const studentsService = makeStudentsService({ memorizedAyat: null });
      const { svc } = make({ students, studentsService });

      const result = await svc.edit(42, actor(), {
        set: [{ startSurah: 2, startVerse: 1, endSurah: 2, endVerse: 10 }],
        clear: [{ startSurah: 2, startVerse: 4, endSurah: 2, endVerse: 6 }],
      });

      expect(result.memorized_ayah_count).toBe(7); // 10 set - 3 cleared
      expect(students.update).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty edit', async () => {
      const { svc } = make({});
      await expect(svc.edit(42, actor(), {})).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid verse range', async () => {
      const { svc } = make({});
      await expect(
        svc.edit(42, actor(), { set: [{ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 999 }] }),
      ).rejects.toThrow();
    });
  });

  describe('drainOnce()', () => {
    it('claims a pending job and settles it to done', async () => {
      const settled: string[] = [];
      const ds = makeDs({
        onQuery: (sql) => {
          if (/status = 'pending'\s*\n?\s*ORDER BY|WHERE status = 'pending'\s*ORDER BY/i.test(sql) || /SELECT id, student_id/i.test(sql)) {
            return [{ id: 5, studentId: 42, attempts: 0 }];
          }
          if (/SET status = 'processing'/i.test(sql)) return { affectedRows: 1 };
          if (/SET status = 'done'/i.test(sql)) {
            settled.push('done');
            return { affectedRows: 1 };
          }
          return undefined; // fall through (ranges handled by default)
        },
      });
      const { svc } = make({ ds });

      const processed = await svc.drainOnce();

      expect(processed).toBe(1);
      expect(settled).toContain('done');
    });
  });
});
