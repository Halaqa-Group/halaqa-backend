import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class ActingSubstituteDto {
  @ApiProperty({ example: 18, description: 'Must be a user in this school with the teacher role, not already actively assigned here.' })
  @IsInt()
  @IsPositive()
  teacher_user_id!: number;

  @ApiProperty({
    format: 'date',
    example: '2026-05-10',
    description: '<= today. Substitutes cannot be future-dated; acting_as_primary is set to 1 immediately.',
  })
  @IsDateString()
  acting_starts_at!: string;

  @ApiProperty({ format: 'date', example: '2026-05-20', description: '>= acting_starts_at.' })
  @IsDateString()
  acting_ends_at!: string;

  @ApiProperty({ required: false, example: "Substitute for A's annual leave", maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
