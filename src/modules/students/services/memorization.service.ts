import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import {
  applyRange,
  countBits,
  createEmptyBitmap,
  toBitmap,
  type VerseRange,
} from '../../../quran/quran-bitmap';
import { MemorizationJob } from '../entities/memorization-job.entity';
import { Student } from '../entities/student.entity';
import { StudentsService } from './students.service';

/** Hard cap on retries before a job is parked as `failed`. */
const MAX_ATTEMPTS = 5;

export interface MemorizationSummary {
  memorized_ayah_count: number;
  bitmap_base64: string;
}

@Injectable()
export class MemorizationService {
  private readonly logger = new Logger(MemorizationService.name);

  constructor(
    @InjectRepository(Student) private readonly students: Repository<Student>,
    @InjectRepository(MemorizationJob)
    private readonly jobs: Repository<MemorizationJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentsService: StudentsService,
    private readonly rangeValidator: QuranRangeValidator,
  ) {}

  // ─── Enqueue ────────────────────────────────────────────────────────────────

  /**
   * Durably enqueues a recompute for the student. One row per student — a burst
   * of achievement changes coalesces into a single `pending` job. Runs on its
   * own connection (autocommit), so it's a fire-and-forget trigger independent
   * of the caller's transaction.
   */
  async enqueueRecompute(studentId: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO memorization_jobs (student_id, status, attempts, created_at, updated_at)
       VALUES (?, 'pending', 0, NOW(6), NOW(6))
       ON DUPLICATE KEY UPDATE status = 'pending', updated_at = NOW(6)`,
      [studentId],
    );
  }

  // ─── Recompute (worker path) ─────────────────────────────────────────────────

  /**
   * Rebuilds the student's bitmap from the union of their approved, non-deleted
   * Hifz achievements. Idempotent — the sole authority the worker applies.
   * Overwrites any manual edits (accepted trade-off).
   */
  async recompute(studentId: number): Promise<void> {
    const ranges: VerseRange[] = await this.dataSource.query(
      `SELECT start_surah AS startSurah, start_verse AS startVerse,
              end_surah AS endSurah, end_verse AS endVerse
         FROM achievements
        WHERE student_id = ?
          AND track_type = 'Hifz'
          AND status = 'approved'
          AND deleted_at IS NULL`,
      [studentId],
    );

    const bitmap = createEmptyBitmap();
    for (const r of ranges) applyRange(bitmap, r, true);

    await this.students.update({ id: studentId }, { memorizedAyat: bitmap });
  }

  // ─── Manual edit ──────────────────────────────────────────────────────────────

  /**
   * Applies manual set/clear ranges directly onto the stored bitmap. Anyone who
   * can access the student in scope may edit. Note: a later recompute (triggered
   * by any Hifz achievement change) overwrites manual edits.
   */
  async edit(
    studentId: number,
    actor: AuthenticatedUser,
    input: { set?: VerseRange[]; clear?: VerseRange[] },
  ): Promise<MemorizationSummary> {
    if (!input.set?.length && !input.clear?.length) {
      throw new BadRequestException(
        'Provide at least one range in `set` or `clear`.',
      );
    }

    const student = await this.studentsService.findInScopeOrFail(
      studentId,
      actor,
    );
    if (this.isParent(actor)) {
      throw new ForbiddenException('Parents cannot edit memorization.');
    }

    for (const r of [...(input.set ?? []), ...(input.clear ?? [])])
      this.rangeValidator.validate(r);

    const bitmap = toBitmap(student.memorizedAyat);
    for (const r of input.set ?? []) applyRange(bitmap, r, true);
    for (const r of input.clear ?? []) applyRange(bitmap, r, false);

    await this.students.update({ id: student.id }, { memorizedAyat: bitmap });
    return this.toSummary(bitmap);
  }

  async get(
    studentId: number,
    actor: AuthenticatedUser,
  ): Promise<MemorizationSummary> {
    const student = await this.studentsService.findInScopeOrFail(
      studentId,
      actor,
    );
    return this.toSummary(toBitmap(student.memorizedAyat));
  }

  // ─── Worker drain ─────────────────────────────────────────────────────────────

  /**
   * Claims and processes up to `limit` pending jobs. Single-instance friendly:
   * each row is claimed with a compare-and-set so a concurrent enqueue that
   * flips a `processing` row back to `pending` is not lost.
   */
  async drainOnce(limit = 50): Promise<number> {
    const pending: { id: number; studentId: number; attempts: number }[] =
      await this.dataSource.query(
        `SELECT id, student_id AS studentId, attempts
         FROM memorization_jobs
        WHERE status = 'pending'
        ORDER BY updated_at ASC
        LIMIT ?`,
        [limit],
      );

    let processed = 0;
    for (const job of pending) {
      const claimed: { affectedRows: number } = await this.dataSource.query(
        `UPDATE memorization_jobs SET status = 'processing', updated_at = NOW(6)
          WHERE id = ? AND status = 'pending'`,
        [job.id],
      );
      if (!claimed.affectedRows) continue; // lost the race; another drain took it

      try {
        await this.recompute(job.studentId);
        // Only settle to 'done' if still 'processing' — a concurrent enqueue may
        // have re-marked it 'pending', which must survive for the next tick.
        await this.dataSource.query(
          `UPDATE memorization_jobs
              SET status = 'done', processed_at = NOW(6), updated_at = NOW(6), last_error = NULL
            WHERE id = ? AND status = 'processing'`,
          [job.id],
        );
        processed++;
      } catch (err) {
        const attempts = job.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        const message = err instanceof Error ? err.message : String(err);
        await this.dataSource.query(
          `UPDATE memorization_jobs
              SET status = ?, attempts = ?, last_error = ?, updated_at = NOW(6)
            WHERE id = ? AND status = 'processing'`,
          [status, attempts, message.slice(0, 1000), job.id],
        );
        this.logger.error(
          `recompute failed for student ${job.studentId} (attempt ${attempts}): ${message}`,
        );
      }
    }
    return processed;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private isParent(actor: AuthenticatedUser): boolean {
    const roles = actor.roles.map((r) => r.slug);
    return (
      roles.includes('parent') &&
      !roles.includes('principal') &&
      !roles.includes('vice_principal') &&
      !roles.includes('supervisor') &&
      !roles.includes('teacher')
    );
  }

  private toSummary(bitmap: Buffer): MemorizationSummary {
    return {
      memorized_ayah_count: countBits(bitmap),
      bitmap_base64: bitmap.toString('base64'),
    };
  }
}
