import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { HalaqaType } from '../entities/halaqa.entity';

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
    example: { weights: { mistake: 1.0 } },
    description: 'Free-form JSON. Pass null to clear.',
  })
  @IsOptional()
  @IsObject()
  evaluation_settings?: Record<string, unknown> | null;
}
