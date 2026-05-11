import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTeacherAssignmentDto {
  @ApiProperty({
    required: false,
    enum: ['main', 'assistant'],
    example: 'assistant',
    description: "Cannot switch to or from 'substitute' here — substitutes have a strict acting lifecycle.",
  })
  @IsOptional()
  @IsEnum(['main', 'assistant'])
  role?: 'main' | 'assistant';

  @ApiProperty({ required: false, example: 'Stepping down to assistant role', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
