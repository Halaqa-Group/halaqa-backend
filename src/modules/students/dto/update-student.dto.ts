/**
 * Body for PATCH /students/:id (principal / vice_principal).
 * All fields are optional. school_id, guardians, and id are not patchable here.
 * Teachers use UpdateStudentByTeacherDto instead (subset of this DTO).
 */
import { ApiProperty } from '@nestjs/swagger';
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
} from 'class-validator';
import { CAPACITY_LIMITS } from '../capacity.config';
import type { StudentGender, StudentStatus } from '../entities/student.entity';

export class UpdateStudentDto {
  @ApiProperty({ required: false, example: 'يوسف محمد', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false, enum: ['male', 'female'], example: 'male' })
  @IsOptional()
  @IsEnum(['male', 'female'])
  gender?: StudentGender;

  @ApiProperty({ required: false, format: 'date', example: '2015-06-01', nullable: true })
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
    description: 'Use POST /students/:id/graduate to set graduated; this field accepts any status for admin overrides.',
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

  @ApiProperty({ required: false, example: 'https://cdn.example.com/photos/1.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;
}
