import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { School, SchoolStatus } from './school.entity';

export interface UpdateSchoolInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  status?: SchoolStatus;
}

/**
 * Read/update of the caller's own school profile. There is no cross-school
 * lookup by design: the row is always resolved from `actor.schoolId`, so a
 * principal can only ever see and edit their own tenant.
 */
@Injectable()
export class SchoolService {
  constructor(
    @InjectRepository(School) private readonly schools: Repository<School>,
    private readonly auditService: AuditService,
  ) {}

  async findForActor(schoolId: number): Promise<School> {
    const school = await this.schools.findOne({ where: { id: schoolId } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async update(
    input: UpdateSchoolInput,
    actor: AuthenticatedUser,
  ): Promise<School> {
    const school = await this.findForActor(actor.schoolId);
    const before = snapshot(school);

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('School name cannot be empty');
      school.name = name;
    }
    if (input.address !== undefined)
      school.address = blankToNull(input.address);
    if (input.phone !== undefined) school.phone = blankToNull(input.phone);
    if (input.status !== undefined) school.status = input.status;

    await this.schools.save(school);

    await this.auditService.log({
      actor,
      action: 'school.update',
      entityType: 'school',
      entityId: school.id,
      oldValues: before,
      newValues: snapshot(school),
    });

    return school;
  }
}

function snapshot(s: School): Record<string, unknown> {
  return {
    name: s.name,
    address: s.address,
    phone: s.phone,
    status: s.status,
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}
