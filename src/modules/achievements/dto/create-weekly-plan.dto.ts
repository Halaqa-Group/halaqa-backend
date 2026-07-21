import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { CreateWeeklyPlanItemDto } from './create-weekly-plan-item.dto';

export class CreateWeeklyPlanDto {
  @ApiProperty({
    example: 42,
    description: "Student ID. Must belong to the caller's school.",
  })
  @Type(() => Number)
  @IsInt()
  student_id!: number;

  @ApiProperty({
    example: 3,
    description: 'Halaqa ID. Caller must have scope on this halaqa.',
  })
  @Type(() => Number)
  @IsInt()
  halaqa_id!: number;

  @ApiProperty({
    format: 'date',
    example: '2026-05-09',
    description: 'Saturday that starts the week.',
  })
  @IsDateString()
  week_start_date!: string;

  @ApiProperty({ type: [CreateWeeklyPlanItemDto], minItems: 1 })
  @Type(() => CreateWeeklyPlanItemDto)
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  items!: CreateWeeklyPlanItemDto[];
}
