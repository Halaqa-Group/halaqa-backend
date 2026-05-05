import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GraduateStudentDto {
  @IsOptional()
  @IsDateString()
  graduation_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
