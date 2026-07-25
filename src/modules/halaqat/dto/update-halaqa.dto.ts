import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { HalaqaType } from '../entities/halaqa.entity';
import { EvaluationSettingsDto } from './evaluation-settings.dto';
import { ReportWeightsDto } from './report-weights.dto';

export class UpdateHalaqaDto {
  @ApiProperty({
    required: false,
    example: 'حلقة الفجر للحفظ - متقدم',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    required: false,
    enum: ['Memorization', 'Tajweed', 'Aqeedah'],
    example: 'Memorization',
    description: 'Only principal / vice_principal may change the type.',
  })
  @IsOptional()
  @IsEnum(['Memorization', 'Tajweed', 'Aqeedah'])
  type?: HalaqaType;

  @ApiProperty({
    required: false,
    nullable: true,
    type: EvaluationSettingsDto,
    description:
      'Per-error-type score deductions. Replaces the stored object wholesale — send every weight ' +
      'you want to keep. Omitted weights fall back to their defaults; pass null to reset to defaults.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EvaluationSettingsDto)
  evaluation_settings?: EvaluationSettingsDto | null;

  @ApiProperty({
    required: false,
    type: ReportWeightsDto,
    description:
      'Daily-report track weights (hifz/near/far/ethics); the four must sum to 100. ' +
      'Full object only — send all four. Only principal / vice_principal may change them.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReportWeightsDto)
  report_weights?: ReportWeightsDto;
}
