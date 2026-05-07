import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import type { GuardianRelation } from '../entities/student-guardian.entity';

export class UpdateGuardianDto {
  @ApiPropertyOptional({
    enum: [
      'father',
      'mother',
      'grandfather',
      'grandmother',
      'uncle',
      'aunt',
      'sibling',
      'other',
    ],
  })
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

  @ApiPropertyOptional({
    description: 'At most one primary guardian per student (BR-STD-04).',
  })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
