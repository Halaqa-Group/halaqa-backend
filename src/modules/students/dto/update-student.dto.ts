import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ example: 'محمد أحمد', minLength: 2, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'] })
  @IsOptional()
  @IsEnum(['male', 'female'])
  gender?: StudentGender;

  @ApiPropertyOptional({ example: '2012-04-15', format: 'date' })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiPropertyOptional({ example: '2024-09-01', format: 'date' })
  @IsOptional()
  @IsDateString()
  join_date?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'graduated'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.hifz.min)
  @Max(CAPACITY_LIMITS.hifz.max)
  daily_hifz_pages_capacity?: number;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.near.min,
    maximum: CAPACITY_LIMITS.near.max,
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.near.min)
  @Max(CAPACITY_LIMITS.near.max)
  daily_near_pages_capacity?: number;

  @ApiPropertyOptional({
    minimum: CAPACITY_LIMITS.far.min,
    maximum: CAPACITY_LIMITS.far.max,
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
}
