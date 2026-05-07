import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    example: 42,
    description:
      'Existing parent user id to link. Provide either `guardian_user_id` OR `email` (+ `name` if creating).',
  })
  @ValidateIf((o: LinkGuardianDto) => !o.email)
  @IsNumber()
  guardian_user_id?: number;

  @ApiPropertyOptional({
    example: 'parent@school.com',
    format: 'email',
    description:
      "Used to find an existing parent user, or to create one when paired with `name`.",
  })
  @ValidateIf((o: LinkGuardianDto) => !o.guardian_user_id)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'أبو محمد',
    description: 'Required only when creating a new parent user via `email`.',
  })
  @ValidateIf(
    (o: LinkGuardianDto) =>
      o.email !== undefined && o.guardian_user_id === undefined,
  )
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+970599123456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
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

  @ApiPropertyOptional({
    default: false,
    description: 'At most one primary guardian per student (BR-STD-04).',
  })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
