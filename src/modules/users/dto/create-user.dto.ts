import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UserStatus } from '../entities/user.entity';

const USER_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

export class CreateUserDto {
  @ApiProperty({ example: 'أحمد المدير', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: 'admin@school.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: '+970599123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    required: false,
    enum: USER_STATUSES,
    default: 'active',
  })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Role slugs to assign at creation (e.g. ["teacher", "parent"]).',
    example: ['teacher'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roles?: string[];
}
