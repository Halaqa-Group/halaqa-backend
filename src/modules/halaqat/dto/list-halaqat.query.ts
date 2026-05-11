import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { HalaqaStatus, HalaqaType } from '../entities/halaqa.entity';

export class ListHalaqatQuery {
  @ApiProperty({ required: false, example: 1, minimum: 1, description: 'Defaults to 1.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 20, minimum: 1, maximum: 100, description: 'Defaults to 20.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ required: false, enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' })
  @IsOptional()
  @IsEnum(['Memorization', 'Tajweed', 'Aqeedah'])
  type?: HalaqaType;

  @ApiProperty({ required: false, enum: ['active', 'archived', 'completed'], example: 'active' })
  @IsOptional()
  @IsEnum(['active', 'archived', 'completed'])
  status?: HalaqaStatus;

  @ApiProperty({ required: false, example: 5, description: 'Filter to halaqat supervised by this user.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  supervisor_user_id?: number;

  @ApiProperty({ required: false, example: 12, description: 'Filter to halaqat where this teacher has an active assignment.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  teacher_user_id?: number;

  @ApiProperty({ required: false, example: 'فجر', maxLength: 100, description: 'Substring match on halaqa name.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
