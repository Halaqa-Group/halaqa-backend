import { MigrationInterface, QueryRunner } from 'typeorm';
import { roundHalfUp } from '../src/common/rounding';
import { pageCoverage } from '../src/quran/page-coverage';

interface RangeRow {
  id: number;
  start_surah: number;
  start_verse: number;
  end_surah: number;
  end_verse: number;
}

/**
 * Fills the page columns left NULL by clients that predate them.
 *
 * `achievements.total_pages` is the volume metric every dashboard KPI sums, and
 * every one of those queries wraps it in `COALESCE(SUM(...),0)` — so a NULL reads
 * as "memorised nothing", not as "unknown". Since the verse range is mandatory
 * and `pageCoverage` is parity-tested against the frontend's page math, the true
 * value is derivable for every row; there is no reason to leave any of them NULL.
 *
 * Position `pages` get the same treatment, and `positions_pages` is then rolled
 * up from them. Rows with no positions (`untracked`) keep NULL — the recited
 * amount there is genuinely unknown, and nothing reads that column as a metric.
 *
 * Irreversible by design: a backfilled value is indistinguishable from a
 * client-supplied one, so `down()` cannot single them out and does nothing.
 */
export class BackfillAchievementPages1781000000000 implements MigrationInterface {
  name = 'BackfillAchievementPages1781000000000';

  /** Applies `pageCoverage` to every row, in CASE-batched updates of 500. */
  private async backfill(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<number> {
    const rows: RangeRow[] = await queryRunner.query(
      `SELECT id, start_surah, start_verse, end_surah, end_verse
         FROM ${table} WHERE ${column} IS NULL`,
    );

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const cases: string[] = [];
      const params: unknown[] = [];
      for (const r of batch) {
        const pages = roundHalfUp(
          pageCoverage({
            startSurah: Number(r.start_surah),
            startVerse: Number(r.start_verse),
            endSurah: Number(r.end_surah),
            endVerse: Number(r.end_verse),
          }),
          4,
        );
        cases.push('WHEN ? THEN ?');
        params.push(r.id, pages);
      }
      await queryRunner.query(
        `UPDATE ${table} SET ${column} = CASE id ${cases.join(' ')} END
          WHERE id IN (${batch.map(() => '?').join(',')})`,
        [...params, ...batch.map((r) => r.id)],
      );
    }

    return rows.length;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.backfill(queryRunner, 'achievements', 'total_pages');
    await this.backfill(
      queryRunner,
      'achievement_recitation_positions',
      'pages',
    );

    // Roll the position pages up. Achievements with no positions stay NULL.
    await queryRunner.query(
      `UPDATE achievements a
         JOIN (
           SELECT achievement_id, SUM(pages) AS total
             FROM achievement_recitation_positions
            GROUP BY achievement_id
         ) p ON p.achievement_id = a.id
          SET a.positions_pages = p.total
        WHERE a.positions_pages IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // No-op: backfilled values are indistinguishable from client-supplied ones.
  }
}
