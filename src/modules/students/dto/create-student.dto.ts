import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CAPACITY_LIMITS } from '../capacity.config';
import type { StudentGender, StudentStatus } from '../entities/student.entity';
import { LinkGuardianDto } from './link-guardian.dto';

export class CreateStudentDto {
  @ApiProperty({ example: 'محمد أحمد', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  @IsEnum(['male', 'female'])
  gender!: StudentGender;

  @ApiPropertyOptional({
    example: '2012-04-15',
    format: 'date',
    description: 'Date of birth (ISO YYYY-MM-DD).',
  })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiProperty({ example: '2024-09-01', format: 'date' })
  @IsDateString()
  join_date!: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'graduated'],
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
    default: 1,
    description: 'Pages per day for hifz (new memorization).',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.hifz.min)
  @Max(CAPACITY_LIMITS.hifz.max)
  daily_hifz_pages_capacity?: number;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.near.min,
    maximum: CAPACITY_LIMITS.near.max,
    default: 5,
    description: 'Pages per day for near revision.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.near.min)
  @Max(CAPACITY_LIMITS.near.max)
  daily_near_pages_capacity?: number;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.far.min,
    maximum: CAPACITY_LIMITS.far.max,
    default: 10,
    description: 'Pages per day for far revision.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.far.min)
  @Max(CAPACITY_LIMITS.far.max)
  daily_far_pages_capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional({
    type: [LinkGuardianDto],
    description:
      'Guardians to link at creation. Each entry either references an existing user (`guardian_user_id`) ' +
      'or creates a parent user from `email` + `name`.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LinkGuardianDto)
  guardians?: LinkGuardianDto[];
}
