import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import type { HalaqaActivityAction } from '../entities/halaqa-activity-log.entity';

const ACTIVITY_ACTIONS: HalaqaActivityAction[] = [
  'halaqa_created',
  'halaqa_updated',
  'halaqa_archived',
  'halaqa_completed',
  'halaqa_restored',
  'teacher_assigned',
  'teacher_unassigned',
  'teacher_role_changed',
  'acting_started',
  'acting_extended',
  'acting_ended',
  'student_enrolled',
  'student_re_enrolled',
  'student_unenrolled',
  'student_transferred_in',
  'student_transferred_out',
  'student_completed',
  'supervisor_assigned',
  'supervisor_unassigned',
  'schedule_updated',
];

export class ListActivityQuery {
  @ApiProperty({
    required: false,
    example: 1,
    minimum: 1,
    description: 'Defaults to 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    required: false,
    example: 20,
    minimum: 1,
    maximum: 100,
    description: 'Defaults to 20.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    enum: ACTIVITY_ACTIONS,
    example: 'student_enrolled',
  })
  @IsOptional()
  @IsEnum(ACTIVITY_ACTIONS)
  action?: HalaqaActivityAction;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-05-01',
    description: 'Inclusive lower bound on created_at.',
  })
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2026-05-31',
    description: 'Inclusive upper bound on created_at.',
  })
  @IsOptional()
  @IsDateString()
  to_date?: string;
}
