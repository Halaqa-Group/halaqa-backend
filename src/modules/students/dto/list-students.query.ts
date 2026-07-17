/**
 * Query params for GET /students.
 * Pagination defaults: page=1, limit=20.
 * include_deleted is silently ignored for non-principal/VP callers.
 * halaqa_id is only relevant for supervisors/teachers; other roles ignore it.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { StudentGender, StudentStatus } from '../entities/student.entity';

export class ListStudentsQuery {
  @ApiProperty({
    required: false,
    example: 1,
    minimum: 1,
    description: 'Defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({
    required: false,
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Defaults to 20, capped at 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    example: 'يوسف',
    description: 'Free-text search on student name.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({
    required: false,
    enum: ['active', 'inactive', 'graduated'],
    example: 'active',
    description: 'Filter by status. Omit to return all statuses.',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiProperty({ required: false, enum: ['male', 'female'], example: 'male' })
  @IsOptional()
  @IsEnum(['male', 'female'])
  gender?: StudentGender;

  @ApiProperty({
    required: false,
    example: 3,
    description:
      'Filter by halaqa. For supervisors/teachers this is an additional scope filter on top of their role-based visibility.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  halaqa_id?: number;

  @ApiProperty({
    required: false,
    example: false,
    description:
      'Include soft-deleted students. Silently ignored for non-principal/VP callers.',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_deleted?: boolean;

  @ApiProperty({
    required: false,
    example: '300123456',
    maxLength: 20,
    description:
      'Exact-match filter on national ID number (normalized before comparison).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  id_number?: string;
}
