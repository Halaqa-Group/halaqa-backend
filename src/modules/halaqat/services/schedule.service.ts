import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { SetScheduleDto } from '../dto/set-schedule.dto';
import type { ScheduleEntryResponse, SetScheduleResponse } from '../dto/halaqa.responses';
import { HalaqaSchedule } from '../entities/halaqa-schedule.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { ScheduleConflictService } from './schedule-conflict.service';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(HalaqaSchedule) private readonly scheduleRepo: Repository<HalaqaSchedule>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly conflictChecker: ScheduleConflictService,
    private readonly activityLog: HalaqaActivityLogService,
  ) {}

  async getSchedule(id: number, actor: AuthenticatedUser): Promise<ScheduleEntryResponse[]> {
    await this.halaqatService.loadAndCheckAccess(id, actor);
    const rows = await this.scheduleRepo.find({
      where: { halaqaId: id },
      order: { dayOfWeek: 'ASC' },
    });
    return rows.map((s) => ({
      id: s.id,
      day_of_week: s.dayOfWeek,
      prayer_slot: s.prayerSlot,
      start_time: s.startTime,
      end_time: s.endTime,
    }));
  }

  async setSchedule(
    id: number,
    dto: SetScheduleDto,
    actor: AuthenticatedUser,
  ): Promise<SetScheduleResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(id, actor);

    const days = dto.schedule.map((s) => s.day_of_week);
    if (new Set(days).size !== days.length) {
      throw new BadRequestException('Duplicate day_of_week values in schedule.');
    }

    const warnings: string[] = [];

    const schedule = await this.dataSource.transaction(async (em) => {
      await em.getRepository(HalaqaSchedule).delete({ halaqaId: id });

      const newRows = dto.schedule.map((s) =>
        em.getRepository(HalaqaSchedule).create({
          halaqaId: id,
          dayOfWeek: s.day_of_week,
          prayerSlot: s.prayer_slot ?? null,
          startTime: s.start_time ?? null,
          endTime: s.end_time ?? null,
        }),
      );

      const saved = newRows.length
        ? await em.getRepository(HalaqaSchedule).save(newRows)
        : [];

      const conflicts = await this.conflictChecker.checkTeachersForNewSchedule(
        id,
        dto.schedule.map((s) => ({ day_of_week: s.day_of_week, prayer_slot: s.prayer_slot })),
        halaqa.schoolId,
        em,
      );

      for (const tc of conflicts) {
        const details = tc.conflicts
          .map((c) => `day ${c.day_of_week}/${c.prayer_slot} overlaps with "${c.conflicting_halaqa_name}"`)
          .join(', ');
        warnings.push(`Teacher ${tc.teacher_name} (ID ${tc.teacher_user_id}): ${details}`);
      }

      await this.activityLog.log(
        { schoolId: halaqa.schoolId, halaqaId: id, action: 'schedule_updated', actorUserId: actor.id },
        em,
      );

      return saved.map((s) => ({
        id: s.id,
        day_of_week: s.dayOfWeek,
        prayer_slot: s.prayerSlot,
        start_time: s.startTime,
        end_time: s.endTime,
      }));
    });

    return { schedule, warnings };
  }
}
