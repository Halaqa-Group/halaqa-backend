import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CAPACITY_LIMITS } from '../capacity.config';

export class UpdateStudentByTeacherDto {
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
}
