import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ErrorHeatmapResponse,
  HeatmapHotspotDto,
} from '../dto/error-heatmap.dto';

interface RawHotspotRow {
  surah: number | string;
  ayah: number | string;
  mistakes_count: number | string;
  warnings_count: number | string;
  tajweed_errors_count: number | string;
  harakat_errors_count: number | string;
  total: number | string;
}

/**
 * Aggregates a student's recitation errors by location to surface the ayat they
 * stumble on most — the "error heatmap". Reads `achievement_position_errors`
 * directly (student_id/date are denormalized onto every row) and groups by
 * (surah, ayah), leaning on the (student_id, error_type, date) and
 * (school_id, surah, ayah) indexes. Includes errors from all achievements in the
 * window (approved or not) — it reflects what the student actually got wrong.
 */
@Injectable()
export class ErrorHeatmapService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getHeatmap(
    studentId: number,
    schoolId: number,
    days = 56,
    limit = 20,
  ): Promise<ErrorHeatmapResponse> {
    const cutoff = this.cutoffDate(days);
    const em = this.dataSource.manager;

    const rows: RawHotspotRow[] = await em.query(
      `SELECT surah, ayah,
         SUM(error_type = 'mistake') AS mistakes_count,
         SUM(error_type = 'warning') AS warnings_count,
         SUM(error_type = 'tajweed') AS tajweed_errors_count,
         SUM(error_type = 'harakat') AS harakat_errors_count,
         COUNT(*) AS total
       FROM achievement_position_errors
       WHERE student_id = ? AND school_id = ? AND date >= ?
       GROUP BY surah, ayah
       ORDER BY total DESC, surah ASC, ayah ASC
       LIMIT ?`,
      [studentId, schoolId, cutoff, limit],
    );

    const hotspots: HeatmapHotspotDto[] = rows.map((r) => ({
      surah: Number(r.surah),
      ayah: Number(r.ayah),
      mistakes_count: Number(r.mistakes_count),
      warnings_count: Number(r.warnings_count),
      tajweed_errors_count: Number(r.tajweed_errors_count),
      harakat_errors_count: Number(r.harakat_errors_count),
      total: Number(r.total),
    }));

    // Grand total across ALL error ayat in the window (not just the returned top N).
    const totalRows: { total: number | string }[] = await em.query(
      `SELECT COUNT(*) AS total
       FROM achievement_position_errors
       WHERE student_id = ? AND school_id = ? AND date >= ?`,
      [studentId, schoolId, cutoff],
    );
    const total_errors = Number(totalRows[0]?.total ?? 0);

    return { student_id: studentId, days, total_errors, hotspots };
  }

  /** The inclusive lower bound date (YYYY-MM-DD) for a `days`-wide window ending today. */
  private cutoffDate(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
}
