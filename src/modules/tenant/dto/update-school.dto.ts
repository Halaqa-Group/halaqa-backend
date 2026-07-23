import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { SchoolStatus } from '../school.entity';

export class UpdateSchoolDto {
  @ApiProperty({
    required: false,
    example: 'مدرسة الفرقان لتحفيظ القرآن',
    minLength: 1,
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'الخليل - شارع عين سارة',
    maxLength: 255,
    description: 'Empty string is stored as null.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '022221234',
    maxLength: 20,
    description: 'Empty string is stored as null.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({
    required: false,
    enum: ['active', 'inactive'],
    example: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: SchoolStatus;
}
