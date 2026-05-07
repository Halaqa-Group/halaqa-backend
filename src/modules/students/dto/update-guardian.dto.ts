/**
 * Body for PATCH /students/:id/guardians/:guardianUserId (principal / vice_principal).
 * Sending is_primary=false is always rejected with 400 — demoting a primary guardian is not allowed;
 * set another guardian as primary instead (which will unset this one automatically).
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import type { GuardianRelation } from '../entities/student-guardian.entity';

export class UpdateGuardianDto {
  @ApiProperty({
    required: false,
    enum: ['father', 'mother', 'grandfather', 'grandmother', 'uncle', 'aunt', 'sibling', 'other'],
    example: 'mother',
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

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Set to true to promote this guardian to primary (unsets the current primary). ' +
      'Setting false is rejected with 400 — use another guardian\'s PATCH with is_primary=true instead.',
  })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
