import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  NOTIFICATION_SERVICE,
  type NotificationService,
} from '../../notifications/notification.service';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';

type PendingActingRow = {
  id: number;
  halaqa_id: number;
  teacher_user_id: number;
  school_id: number;
};

type NoPrimaryRow = {
  id: number;
  school_id: number;
  name: string;
};

@Injectable()
export class HalaqaCronService {
  private readonly logger = new Logger(HalaqaCronService.name);

  constructor(
    @InjectRepository(HalaqaTeacher)
    private readonly repo: Repository<HalaqaTeacher>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activityLog: HalaqaActivityLogService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: NotificationService,
  ) {}

  // ─── Activate scheduled acting assignments ─────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async activateScheduledActing(): Promise<void> {
    const rows: PendingActingRow[] = await this.dataSource.manager.query(
      `SELECT ht.id, ht.halaqa_id, ht.teacher_user_id, h.school_id
       FROM halaqa_teachers ht
       JOIN halaqat h ON h.id = ht.halaqa_id
       WHERE ht.acting_as_primary = 0
         AND ht.acting_starts_at <= CURDATE()
         AND ht.end_date IS NULL
         AND (ht.acting_ends_at IS NULL OR ht.acting_ends_at >= CURDATE())`,
    );

    if (rows.length === 0) return;

    this.logger.log(
      `activateScheduledActing: activating ${rows.length} assignment(s)`,
    );

    for (const row of rows) {
      await this.repo.update(row.id, { actingAsPrimary: true });

      await this.activityLog.log({
        schoolId: row.school_id,
        halaqaId: row.halaqa_id,
        action: 'acting_started',
        actorUserId: null,
        targetUserId: row.teacher_user_id,
      });
    }
  }

  // ─── Notify when a halaqa has no primary teacher ───────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async notifyNoPrimaryTeacher(): Promise<void> {
    const rows: NoPrimaryRow[] = await this.dataSource.manager.query(
      `SELECT h.id, h.school_id, h.name
       FROM halaqat h
       WHERE h.status = 'active'
         AND h.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM halaqa_teachers ht
           WHERE ht.halaqa_id = h.id
             AND ht.end_date IS NULL
             AND (ht.role = 'main' OR ht.acting_as_primary = 1)
         )`,
    );

    if (rows.length === 0) return;

    this.logger.log(
      `notifyNoPrimaryTeacher: ${rows.length} halaqa(t) without a primary teacher`,
    );

    for (const row of rows) {
      await this.notifications.notifyRole(row.school_id, 'vice_principal', {
        type: 'halaqa.no_primary_teacher',
        halaqaId: row.id,
        halaqaName: row.name,
      });
    }
  }
}
