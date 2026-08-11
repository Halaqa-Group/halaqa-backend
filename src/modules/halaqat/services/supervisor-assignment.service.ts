import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import { shortNameSql } from '../../../common/person-name';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AssignSupervisorDto } from '../dto/assign-supervisor.dto';
import type { SupervisorSummaryResponse } from '../dto/halaqa.responses';
import { SupervisorHalaqa } from '../entities/supervisor-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';

type SupervisorRow = {
  user_id: number;
  name: string;
  assigned_at: Date;
};

@Injectable()
export class SupervisorAssignmentService {
  constructor(
    @InjectRepository(SupervisorHalaqa)
    private readonly repo: Repository<SupervisorHalaqa>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly halaqatService: HalaqatService,
    private readonly activityLog: HalaqaActivityLogService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toResponse(row: SupervisorRow): SupervisorSummaryResponse {
    return {
      user_id: row.user_id,
      name: row.name,
      assigned_at: row.assigned_at,
    };
  }

  private async loadRow(
    supervisorUserId: number,
    halaqaId: number,
  ): Promise<SupervisorSummaryResponse> {
    const rows: SupervisorRow[] = await this.dataSource.manager.query(
      `SELECT sh.supervisor_user_id AS user_id, ${shortNameSql('u')} AS name, sh.assigned_at
       FROM supervisor_halaqat sh
       JOIN users u ON u.id = sh.supervisor_user_id
       WHERE sh.supervisor_user_id = ? AND sh.halaqa_id = ?`,
      [supervisorUserId, halaqaId],
    );
    if (!rows.length) throw new NotFoundException('Assignment not found.');
    return this.toResponse(rows[0]);
  }

  // ─── Public methods ────────────────────────────────────────────────────────

  async assign(
    halaqaId: number,
    dto: AssignSupervisorDto,
    actor: AuthenticatedUser,
  ): Promise<SupervisorSummaryResponse> {
    const halaqa = await this.halaqatService.loadAndCheckAccess(
      halaqaId,
      actor,
    );
    await this.halaqatService.verifyUserRoleInSchool(
      dto.supervisor_user_id,
      halaqa.schoolId,
      'supervisor',
    );

    const existing = await this.repo.findOne({
      where: { halaqaId, supervisorUserId: dto.supervisor_user_id },
    });
    if (existing) {
      throw new ConflictException(
        'Supervisor is already assigned to this halaqa.',
      );
    }

    await this.repo.save(
      this.repo.create({ halaqaId, supervisorUserId: dto.supervisor_user_id }),
    );

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: 'supervisor_assigned',
      actorUserId: actor.id,
      targetUserId: dto.supervisor_user_id,
    });

    return this.loadRow(dto.supervisor_user_id, halaqaId);
  }

  async listSupervisors(
    halaqaId: number,
    actor: AuthenticatedUser,
  ): Promise<SupervisorSummaryResponse[]> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const rows: SupervisorRow[] = await this.dataSource.manager.query(
      `SELECT sh.supervisor_user_id AS user_id, ${shortNameSql('u')} AS name, sh.assigned_at
       FROM supervisor_halaqat sh
       JOIN users u ON u.id = sh.supervisor_user_id
       WHERE sh.halaqa_id = ?
       ORDER BY sh.assigned_at ASC`,
      [halaqaId],
    );
    return rows.map((r) => this.toResponse(r));
  }

  async unassign(
    halaqaId: number,
    supervisorId: number,
    actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    await this.halaqatService.loadAndCheckAccess(halaqaId, actor);

    const existing = await this.repo.findOne({
      where: { halaqaId, supervisorUserId: supervisorId },
    });
    if (!existing)
      throw new NotFoundException('Supervisor is not assigned to this halaqa.');

    await this.repo.delete({ halaqaId, supervisorUserId: supervisorId });

    await this.activityLog.log({
      schoolId: actor.schoolId,
      halaqaId,
      action: 'supervisor_unassigned',
      actorUserId: actor.id,
      targetUserId: supervisorId,
    });

    return { message: 'Supervisor unassigned.' };
  }
}
