import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { HalaqaType } from '../entities/halaqa.entity';
import { EvaluationSettingsDto } from './evaluation-settings.dto';

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
    type: EvaluationSettingsDto,
    description:
      'Per-error-type score deductions used by the frontend to compute percentage_score. ' +
      'Any omitted weight falls back to its default (mistake 4, warning 2, tajweed 1, harakat 2).',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EvaluationSettingsDto)
  evaluation_settings?: EvaluationSettingsDto | null;

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
