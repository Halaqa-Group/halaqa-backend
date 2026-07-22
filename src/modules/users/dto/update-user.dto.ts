import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { NAME_PART_MAX_LENGTH } from '../../../common/person-name';
import type { UserStatus } from '../entities/user.entity';

const USER_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

/**
 * Principal-driven user update. Cannot change `email`, `school_id`, or roles —
 * those need their own dedicated endpoints. Self-edits use PATCH /me which has
 * an even narrower whitelist (BR-USR-06).
 */
export class UpdateUserDto {
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

  @ApiProperty({ required: false, enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;
}
