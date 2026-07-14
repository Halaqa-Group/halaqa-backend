import { ApiProperty } from '@nestjs/swagger';
import { Holiday } from '../entities/holiday.entity';
import { SchoolSchedule } from '../entities/school-schedule.entity';

export class SchoolScheduleResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 0, description: '0=Saturday … 6=Friday.' })
  day_of_week!: number;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  effective_from!: string;

  @ApiProperty({ nullable: true, format: 'date', example: null })
  effective_to!: string | null;

  @ApiProperty({ nullable: true, example: 'دوام صباحي' })
  notes!: string | null;

  static fromEntity(s: SchoolSchedule): SchoolScheduleResponse {
    const dto = new SchoolScheduleResponse();
    dto.id = s.id;
    dto.day_of_week = s.dayOfWeek;
    dto.effective_from = s.effectiveFrom;
    dto.effective_to = s.effectiveTo;
    dto.notes = s.notes;
    return dto;
  }
}

export class HolidayResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ format: 'date', example: '2026-12-25' })
  holiday_date!: string;

  @ApiProperty({ example: 'عطلة رسمية' })
  description!: string;

  static fromEntity(h: Holiday): HolidayResponse {
    const dto = new HolidayResponse();
    dto.id = h.id;
    dto.holiday_date = h.holidayDate;
    dto.description = h.description;
    return dto;
  }
}

export class SchoolScheduleListData {
  @ApiProperty({ type: [SchoolScheduleResponse] })
  items!: SchoolScheduleResponse[];
}

export class HolidayListData {
  @ApiProperty({ type: [HolidayResponse] })
  items!: HolidayResponse[];
}
