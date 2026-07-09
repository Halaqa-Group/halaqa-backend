import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { Holiday } from '../entities/holiday.entity';
import { SchoolSchedule } from '../entities/school-schedule.entity';

export interface CreateScheduleInput {
  dayOfWeek: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
}

export interface CreateHolidayInput {
  holidayDate: string;
  description: string;
}

/**
 * CRUD for the school calendar the seed cron depends on: which weekdays the
 * school operates (`school_schedules`) and which dates are holidays
 * (`holidays`). School-scoped; mutations are principal/VP only (enforced by the
 * controller `@Roles`).
 */
@Injectable()
export class SchoolCalendarService {
  constructor(
    @InjectRepository(SchoolSchedule)
    private readonly schedules: Repository<SchoolSchedule>,
    @InjectRepository(Holiday)
    private readonly holidays: Repository<Holiday>,
    private readonly auditService: AuditService,
  ) {}

  // ─── Schedules ──────────────────────────────────────────────────────────────

  async createSchedule(
    input: CreateScheduleInput,
    actor: AuthenticatedUser,
  ): Promise<SchoolSchedule> {
    const row = this.schedules.create({
      schoolId: actor.schoolId,
      dayOfWeek: input.dayOfWeek,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      notes: input.notes ?? null,
      createdBy: actor.id,
    });
    await this.schedules.save(row);

    await this.auditService.log({
      actor,
      action: 'school_schedule.create',
      entityType: 'school_schedule',
      entityId: row.id,
      newValues: {
        dayOfWeek: row.dayOfWeek,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
      },
    });

    return row;
  }

  async listSchedules(
    schoolId: number,
    on?: string,
  ): Promise<SchoolSchedule[]> {
    if (on) {
      return this.schedules.find({
        where: [
          {
            schoolId,
            effectiveFrom: LessThanOrEqual(on),
            effectiveTo: MoreThanOrEqual(on),
          },
          {
            schoolId,
            effectiveFrom: LessThanOrEqual(on),
            effectiveTo: IsNull(),
          },
        ],
        order: { dayOfWeek: 'ASC' },
      });
    }
    return this.schedules.find({
      where: { schoolId },
      order: { effectiveFrom: 'DESC', dayOfWeek: 'ASC' },
    });
  }

  async deleteSchedule(id: number, actor: AuthenticatedUser): Promise<void> {
    const row = await this.schedules.findOne({
      where: { id, schoolId: actor.schoolId },
    });
    if (!row) throw new NotFoundException();
    await this.schedules.remove(row);

    await this.auditService.log({
      actor,
      action: 'school_schedule.delete',
      entityType: 'school_schedule',
      entityId: id,
      oldValues: { dayOfWeek: row.dayOfWeek, effectiveFrom: row.effectiveFrom },
    });
  }

  // ─── Holidays ───────────────────────────────────────────────────────────────

  async createHoliday(
    input: CreateHolidayInput,
    actor: AuthenticatedUser,
  ): Promise<Holiday> {
    const clash = await this.holidays.findOne({
      where: { schoolId: actor.schoolId, holidayDate: input.holidayDate },
    });
    if (clash) {
      throw new ConflictException('A holiday already exists on this date.');
    }

    const row = this.holidays.create({
      schoolId: actor.schoolId,
      holidayDate: input.holidayDate,
      description: input.description,
      createdBy: actor.id,
    });
    await this.holidays.save(row);

    await this.auditService.log({
      actor,
      action: 'holiday.create',
      entityType: 'holiday',
      entityId: row.id,
      newValues: { holidayDate: row.holidayDate, description: row.description },
    });

    return row;
  }

  async listHolidays(
    schoolId: number,
    from?: string,
    to?: string,
  ): Promise<Holiday[]> {
    const qb = this.holidays
      .createQueryBuilder('h')
      .where('h.schoolId = :schoolId', { schoolId });
    if (from) qb.andWhere('h.holidayDate >= :from', { from });
    if (to) qb.andWhere('h.holidayDate <= :to', { to });
    return qb.orderBy('h.holidayDate', 'ASC').getMany();
  }

  async deleteHoliday(id: number, actor: AuthenticatedUser): Promise<void> {
    const row = await this.holidays.findOne({
      where: { id, schoolId: actor.schoolId },
    });
    if (!row) throw new NotFoundException();
    await this.holidays.remove(row);

    await this.auditService.log({
      actor,
      action: 'holiday.delete',
      entityType: 'holiday',
      entityId: id,
      oldValues: { holidayDate: row.holidayDate },
    });
  }
}
