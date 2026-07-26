import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { NAME_PART_MAX_LENGTH } from '../../../common/person-name';
import type { UserStatus } from '../entities/user.entity';

const USER_STATUSES: UserStatus[] = ['active', 'inactive', 'suspended'];

export class CreateUserDto {
  @ApiProperty({
    example: 'أحمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'الاسم الأول',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  first_name!: string;

  @ApiProperty({
    example: 'محمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الأب',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  second_name!: string;

  @ApiProperty({
    example: 'علي',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الجد',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  third_name!: string;

  @ApiProperty({
    example: 'المدير',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم العائلة',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  family_name!: string;

  @ApiProperty({
    example: '400000006',
    maxLength: 20,
    description:
      'National ID number (Palestinian: 9 digits). Normalized and unique per school; ' +
      'also usable as a login identifier. A bad checksum is stored with a warning, not rejected.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  id_number!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'admin@school.com',
    format: 'email',
    description:
      'Optional — users log in with `id_number` when they have no email.',
  })
  @IsOptional()
  @ValidateIf((o: CreateUserDto) => o.email !== null && o.email !== '')
  @IsEmail()
  email?: string | null;

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
