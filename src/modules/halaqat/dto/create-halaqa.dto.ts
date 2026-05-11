import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsAfterField } from '../../../common/validators/is-after-field.decorator';
import type { HalaqaType } from '../entities/halaqa.entity';
import type { PrayerSlot } from '../entities/halaqa-schedule.entity';

export class ScheduleEntryDto {
  @ApiProperty({ example: 0, minimum: 0, maximum: 6, description: '0=Saturday … 6=Friday' })
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;

  @ApiProperty({
    required: false,
    enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
    example: 'fajr',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'])
  prayer_slot?: PrayerSlot;

  @ApiProperty({ required: false, example: '05:00:00', nullable: true, description: 'HH:MM:SS — display only.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, { message: 'start_time must be a valid HH:MM:SS (00:00:00–23:59:59)' })
  start_time?: string;

  @ApiProperty({ required: false, example: '06:00:00', nullable: true, description: 'HH:MM:SS — display only.' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, { message: 'end_time must be a valid HH:MM:SS (00:00:00–23:59:59)' })
  @IsAfterField('start_time', { message: 'end_time must be after start_time' })
  end_time?: string;
}

export class CreateHalaqaDto {
  @ApiProperty({ example: 'حلقة الفجر للحفظ', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ['Memorization', 'Tajweed', 'Aqeedah'], example: 'Memorization' })
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
    description: 'Creates an active main-teacher assignment on creation. Runs schedule-conflict check.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  primary_teacher_user_id?: number;

  @ApiProperty({
    required: false,
    type: [ScheduleEntryDto],
    description: 'Initial weekly schedule. Duplicate day_of_week values are rejected.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  schedule?: ScheduleEntryDto[];
}
