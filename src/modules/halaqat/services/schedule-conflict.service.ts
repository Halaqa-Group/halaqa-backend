import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export interface ConflictDetail {
  day_of_week: number;
  prayer_slot: string;
  conflicting_halaqa_id: number;
  conflicting_halaqa_name: string;
}

export interface TeacherConflict {
  teacher_user_id: number;
  teacher_name: string;
  conflicts: ConflictDetail[];
}

@Injectable()
export class ScheduleConflictService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * BR-HLQ-02: Check whether assigning teacherUserId to targetHalaqaId would
   * conflict with any of their other active halaqat (end_date IS NULL, school-scoped).
   * The target halaqa itself is excluded (handles re-assignment to the same halaqa).
   * Returns [] when there is no conflict.
   */
  async checkForTeacher(
    teacherUserId: number,
    targetHalaqaId: number,
    schoolId: number,
    em?: EntityManager,
  ): Promise<ConflictDetail[]> {
    const runner = em ?? this.dataSource.manager;
    const rows: ConflictDetail[] = await runner.query(
      `
      SELECT
        s1.day_of_week                AS day_of_week,
        s1.prayer_slot                AS prayer_slot,
        h2.id                         AS conflicting_halaqa_id,
        h2.name                       AS conflicting_halaqa_name
      FROM halaqa_schedules s1
      JOIN halaqa_schedules s2
        ON  s2.day_of_week = s1.day_of_week
        AND s2.prayer_slot = s1.prayer_slot
        AND s1.prayer_slot IS NOT NULL
      JOIN halaqat h2 ON h2.id = s2.halaqa_id
      JOIN halaqa_teachers ht
        ON  ht.halaqa_id       = h2.id
        AND ht.teacher_user_id = ?
        AND ht.end_date        IS NULL
      WHERE s1.halaqa_id = ?
        AND h2.id       != ?
        AND h2.school_id = ?
      `,
      [teacherUserId, targetHalaqaId, targetHalaqaId, schoolId],
    );
    return rows;
  }

  /**
   * Check whether a proposed new schedule for halaqaId would conflict with the
   * other halaqat of any active non-acting teacher currently assigned to it.
   * Acting teachers are excluded per BR-HLQ-08 (acting bypasses the conflict check).
   * Returns [] when there are no conflicts or when the new schedule has no prayer_slot entries.
   */
  async checkTeachersForNewSchedule(
    halaqaId: number,
    newSlots: Array<{ day_of_week: number; prayer_slot?: string | null }>,
    schoolId: number,
    em?: EntityManager,
  ): Promise<TeacherConflict[]> {
    const effectiveSlots = newSlots.filter((s) => s.prayer_slot);
    if (effectiveSlots.length === 0) return [];

    const runner = em ?? this.dataSource.manager;
    const slotPlaceholders = effectiveSlots.map(() => '(?, ?)').join(', ');
    const slotValues = effectiveSlots.flatMap((s) => [s.day_of_week, s.prayer_slot]);

    type Row = {
      teacher_user_id: number;
      teacher_name: string;
      day_of_week: number;
      prayer_slot: string;
      conflicting_halaqa_id: number;
      conflicting_halaqa_name: string;
    };

    const rows: Row[] = await runner.query(
      `
      SELECT
        ht_src.teacher_user_id            AS teacher_user_id,
        u.name                            AS teacher_name,
        s2.day_of_week                    AS day_of_week,
        s2.prayer_slot                    AS prayer_slot,
        h2.id                             AS conflicting_halaqa_id,
        h2.name                           AS conflicting_halaqa_name
      FROM halaqa_teachers ht_src
      JOIN users u ON u.id = ht_src.teacher_user_id
      JOIN halaqa_teachers ht_other
        ON  ht_other.teacher_user_id = ht_src.teacher_user_id
        AND ht_other.halaqa_id      != ?
        AND ht_other.end_date        IS NULL
      JOIN halaqa_schedules s2 ON s2.halaqa_id = ht_other.halaqa_id
      JOIN halaqat h2 ON h2.id = s2.halaqa_id
      WHERE ht_src.halaqa_id         = ?
        AND ht_src.end_date          IS NULL
        AND ht_src.acting_as_primary = 0
        AND h2.school_id             = ?
        AND (s2.day_of_week, s2.prayer_slot) IN (${slotPlaceholders})
      `,
      [halaqaId, halaqaId, schoolId, ...slotValues],
    );

    const grouped = new Map<number, TeacherConflict>();
    for (const row of rows) {
      if (!grouped.has(row.teacher_user_id)) {
        grouped.set(row.teacher_user_id, {
          teacher_user_id: row.teacher_user_id,
          teacher_name: row.teacher_name,
          conflicts: [],
        });
      }
      grouped.get(row.teacher_user_id)!.conflicts.push({
        day_of_week: row.day_of_week,
        prayer_slot: row.prayer_slot,
        conflicting_halaqa_id: row.conflicting_halaqa_id,
        conflicting_halaqa_name: row.conflicting_halaqa_name,
      });
    }
    return [...grouped.values()];
  }
}
