import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecalculateDto {
  @ApiProperty({
    required: false,
    maxLength: 255,
    example: 'تم تصحيح تسميع الطالب',
    description: 'Reason recorded on the report and in the audit log (§29.3).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
