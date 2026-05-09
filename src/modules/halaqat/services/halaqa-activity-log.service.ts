import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
  ) {}

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
