import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import type { GuardianRelation } from '../entities/student-guardian.entity';

export class UpdateGuardianDto {
  @IsOptional()
  @IsEnum([
    'father',
    'mother',
    'grandfather',
    'grandmother',
    'uncle',
    'aunt',
    'sibling',
    'other',
  ])
  relation?: GuardianRelation;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
