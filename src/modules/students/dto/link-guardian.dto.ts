/**
 * Body for POST /students/:id/guardians.
 * Exactly one of guardian_user_id or email must be supplied (mutually exclusive).
 * - guardian_user_id: link an existing user; must belong to the same school.
 * - email: if a user with that email already exists they are linked; otherwise a new user is created
 *   with a parent role and a parent-invite email is sent. In the new-user case, `name` is required.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { GuardianRelation } from '../entities/student-guardian.entity';

export class LinkGuardianDto {
  @ApiProperty({
    required: false,
    example: 42,
    description: 'ID of an existing user. Mutually exclusive with `email`. Must belong to the same school.',
  })
  @ValidateIf((o: LinkGuardianDto) => !o.email)
  @IsNumber()
  guardian_user_id?: number;

  @ApiProperty({
    required: false,
    example: 'parent@example.com',
    format: 'email',
    description: 'Email of the guardian. Mutually exclusive with `guardian_user_id`. Creates a new user if not found.',
  })
  @ValidateIf((o: LinkGuardianDto) => !o.guardian_user_id)
  @IsEmail()
  email?: string;

  @ApiProperty({
    required: false,
    example: 'محمد أبو أحمد',
    description: 'Required when `email` is provided and the user does not yet exist.',
  })
  @ValidateIf(
    (o: LinkGuardianDto) =>
      o.email !== undefined && o.guardian_user_id === undefined,
  )
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: '+970599000001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    enum: ['father', 'mother', 'grandfather', 'grandmother', 'uncle', 'aunt', 'sibling', 'other'],
    example: 'father',
  })
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
  relation!: GuardianRelation;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Exactly one guardian per student may be primary. ' +
      'If omitted on the first guardian, forced to true. ' +
      'Setting true unsets the current primary. Setting false on the current primary is rejected (400).',
  })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiProperty({
    required: false,
    example: true,
    description: 'Whether the guardian is authorised to pick up the student. Defaults to true.',
  })
  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
