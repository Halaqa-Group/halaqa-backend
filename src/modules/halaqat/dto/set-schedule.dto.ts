import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ScheduleEntryDto } from './create-halaqa.dto';

export class SetScheduleDto {
  @ApiProperty({
    type: [ScheduleEntryDto],
    description: 'Full weekly schedule — replaces the existing one atomically. Send an empty array to clear the schedule.',
  })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  schedule!: ScheduleEntryDto[];
}
