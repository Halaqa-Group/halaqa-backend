/**
 * Body for POST /students (principal / vice_principal).
 * An optional `guardians` array creates and links guardians atomically.
 * The first entry is forced to is_primary=true regardless of the submitted value.
 * Whitelist is enforced globally (forbidNonWhitelisted=true); school_id is inferred from the token.
 */
import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'يوسف محمد', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  @IsEnum(['male', 'female'])
  gender!: StudentGender;

  @ApiProperty({ required: false, format: 'date', example: '2015-06-01', nullable: true })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiProperty({ format: 'date', example: '2024-09-01' })
  @IsDateString()
  join_date!: string;

  @ApiProperty({
    required: false,
    enum: ['active', 'inactive', 'graduated'],
    example: 'active',
    description: 'Defaults to `active` when omitted.',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiProperty({
    required: false,
    example: 1.0,
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
    description: 'Daily Hifz memorisation target in pages. Defaults to 0.5.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.hifz.min)
  @Max(CAPACITY_LIMITS.hifz.max)
  daily_hifz_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 2.0,
    minimum: CAPACITY_LIMITS.near.min,
    maximum: CAPACITY_LIMITS.near.max,
    description: 'Daily near-review target in pages. Defaults to 2.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.near.min)
  @Max(CAPACITY_LIMITS.near.max)
  daily_near_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 5.0,
    minimum: CAPACITY_LIMITS.far.min,
    maximum: CAPACITY_LIMITS.far.max,
    description: 'Daily far-review target in pages. Defaults to 5.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.far.min)
  @Max(CAPACITY_LIMITS.far.max)
  daily_far_pages_capacity?: number;

  @ApiProperty({ required: false, example: 'Needs extra support on Juz 30.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/photos/1.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    required: false,
    type: [LinkGuardianDto],
    description: 'Guardians linked atomically in the same transaction. First entry is forced to is_primary=true.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LinkGuardianDto)
  guardians?: LinkGuardianDto[];
}
