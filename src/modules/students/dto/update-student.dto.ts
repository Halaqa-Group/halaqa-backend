/**
 * Body for PATCH /students/:id (principal / vice_principal).
 * All fields are optional. school_id, guardians, and id are not patchable here.
 * Teachers use UpdateStudentByTeacherDto instead (subset of this DTO).
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { NAME_PART_MAX_LENGTH } from '../../../common/person-name';
import { CAPACITY_LIMITS } from '../capacity.config';
import type { StudentGender, StudentStatus } from '../entities/student.entity';

export class UpdateStudentDto {
  @ApiProperty({
    required: false,
    example: 'يوسف',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'الاسم الأول',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  first_name?: string;

  @ApiProperty({
    required: false,
    example: 'محمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الأب',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  second_name?: string;

  @ApiProperty({
    required: false,
    example: 'أحمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الجد',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  third_name?: string;

  @ApiProperty({
    required: false,
    example: 'الحسني',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم العائلة',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  family_name?: string;

  @ApiProperty({ required: false, enum: ['male', 'female'], example: 'male' })
  @IsOptional()
  @IsEnum(['male', 'female'])
  gender?: StudentGender;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2015-06-01',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiProperty({ required: false, format: 'date', example: '2024-09-01' })
  @IsOptional()
  @IsDateString()
  join_date?: string;

  @ApiProperty({
    required: false,
    enum: ['active', 'inactive', 'graduated'],
    example: 'active',
    description:
      'Use POST /students/:id/graduate to set graduated; this field accepts any status for admin overrides.',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiProperty({
    required: false,
    example: 1.0,
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
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

  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/photos/1.jpg',
  })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '300123456',
    maxLength: 20,
    description:
      'National ID number. Set to null to clear a previously-set value (requires force_id_number_change: true). ' +
      'Changing an already-set value also requires the flag. ' +
      'A bad checksum is stored with a warning in the response.',
  })
  @IsOptional()
  @ValidateIf((o: UpdateStudentDto) => o.id_number !== null)
  @IsString()
  @MaxLength(20)
  id_number?: string | null;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Required when changing or clearing an already-set id_number. Transient — never persisted.',
  })
  @IsOptional()
  @IsBoolean()
  force_id_number_change?: boolean;
}
