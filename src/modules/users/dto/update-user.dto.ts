import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import type { UserStatus } from '../entities/user.entity';

const USER_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

/**
 * Principal-driven user update. Cannot change `email`, `school_id`, or roles —
 * those need their own dedicated endpoints. Self-edits use PATCH /me which has
 * an even narrower whitelist (BR-USR-06).
 */
export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'أحمد', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

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
