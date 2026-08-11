import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { shortNameSql } from '../../../common/person-name';
import { ActivityLogData, ActivityLogItem } from '../dto/halaqa.responses';
import { ListActivityQuery } from '../dto/list-activity.query';
import {
  HalaqaActivityAction,
  HalaqaActivityLog,
} from '../entities/halaqa-activity-log.entity';

export interface LogParams {
  schoolId: number;
  halaqaId?: number | null;
  action: HalaqaActivityAction;
  actorUserId?: number | null;
  targetUserId?: number | null;
  targetStudentId?: number | null;
  fromHalaqaId?: number | null;
  toHalaqaId?: number | null;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
}

@Injectable()
export class HalaqaActivityLogService {
  constructor(
    @InjectRepository(HalaqaActivityLog)
    private readonly repo: Repository<HalaqaActivityLog>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listForHalaqa(
    halaqaId: number,
    schoolId: number,
    query: ListActivityQuery,
  ): Promise<ActivityLogData> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['al.halaqa_id = ?', 'al.school_id = ?'];
    const params: unknown[] = [halaqaId, schoolId];

    if (query.action) {
      conditions.push('al.action = ?');
      params.push(query.action);
    }
    if (query.from_date) {
      conditions.push('DATE(al.created_at) >= ?');
      params.push(query.from_date);
    }
    if (query.to_date) {
      conditions.push('DATE(al.created_at) <= ?');
      params.push(query.to_date);
    }

    const whereClause = conditions.join(' AND ');

    const [rows, countRows] = await Promise.all([
      this.dataSource.manager.query<ActivityLogItem[]>(
        `SELECT al.id, al.action,
                al.actor_user_id, ${shortNameSql('actor')} AS actor_name,
                al.target_user_id, ${shortNameSql('tu')} AS target_user_name,
                al.target_student_id, ${shortNameSql('s')} AS target_student_name,
                al.from_halaqa_id, al.to_halaqa_id,
                al.metadata, al.notes, al.created_at
         FROM halaqa_activity_logs al
         LEFT JOIN users actor ON actor.id = al.actor_user_id
         LEFT JOIN users tu ON tu.id = al.target_user_id
         LEFT JOIN students s ON s.id = al.target_student_id
         WHERE ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      ),
      this.dataSource.manager.query<[{ total: string }]>(
        `SELECT COUNT(*) AS total FROM halaqa_activity_logs al WHERE ${whereClause}`,
        params,
      ),
    ]);

    return { items: rows, total: Number(countRows[0].total), page, limit };
  }

  async log(params: LogParams, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(HalaqaActivityLog) : this.repo;
    await repo.save(
      repo.create({
        schoolId: params.schoolId,
        halaqaId: params.halaqaId ?? null,
        action: params.action,
        actorUserId: params.actorUserId ?? null,
        targetUserId: params.targetUserId ?? null,
        targetStudentId: params.targetStudentId ?? null,
        fromHalaqaId: params.fromHalaqaId ?? null,
        toHalaqaId: params.toHalaqaId ?? null,
        metadata: params.metadata ?? null,
        notes: params.notes ?? null,
      }),
    );
  }
}
