import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { NAME_PART_MAX_LENGTH } from '../../../common/person-name';

/**
 * Self-edit whitelist (BR-USR-06). Email, school_id, status, and roles are
 * intentionally absent — those need a principal-driven endpoint. With
 * `forbidNonWhitelisted: true` on the global ValidationPipe, sending any
 * other field returns 400.
 */
export class UpdateMeDto {
  @ApiProperty({
    required: false,
    example: 'أحمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'الاسم الأول',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  first_name?: string;

  @ApiProperty({
    required: false,
    example: 'محمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الأب',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  second_name?: string;

  @ApiProperty({
    required: false,
    example: 'علي',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الجد',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  third_name?: string;

  @ApiProperty({
    required: false,
    example: 'المدير',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم العائلة',
  })
  @IsOptional()
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  family_name?: string;

  @ApiProperty({ required: false, example: '+970599123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo_url?: string;
}
