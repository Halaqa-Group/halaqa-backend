import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { HalaqaType } from '../entities/halaqa.entity';

export class CreateHalaqaDto {
  @ApiProperty({ example: 'حلقة الفجر للحفظ', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    enum: ['Memorization', 'Tajweed', 'Aqeedah'],
    example: 'Memorization',
  })
  @IsEnum(['Memorization', 'Tajweed', 'Aqeedah'])
  type!: HalaqaType;

  @ApiProperty({
    required: false,
    nullable: true,
    example: null,
    description: 'Free-form JSON for evaluation weights and thresholds.',
  })
  @IsOptional()
  @IsObject()
  evaluation_settings?: Record<string, unknown> | null;

  @ApiProperty({
    required: false,
    example: 12,
    description: 'Creates an active main-teacher assignment on creation.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  primary_teacher_user_id?: number;
}
