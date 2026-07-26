/**
 * Body for POST /students (principal / vice_principal).
 * An optional `guardians` array creates and links guardians atomically.
 * The first entry is forced to is_primary=true regardless of the submitted value.
 * Whitelist is enforced globally (forbidNonWhitelisted=true); school_id is inferred from the token.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { NAME_PART_MAX_LENGTH } from '../../../common/person-name';
import {
  PHONE_COUNTRY_CODE_MAX_LENGTH,
  PHONE_NUMBER_MAX_LENGTH,
} from '../../../common/phone';
import { CAPACITY_LIMITS } from '../capacity.config';
import type {
  MemorizationDirection,
  StudentGender,
  StudentStatus,
} from '../entities/student.entity';
import { LinkGuardianDto } from './link-guardian.dto';

export class CreateStudentDto {
  @ApiProperty({
    example: 'يوسف',
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
    example: 'أحمد',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم الجد',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  third_name!: string;

  @ApiProperty({
    example: 'الحسني',
    maxLength: NAME_PART_MAX_LENGTH,
    description: 'اسم العائلة',
  })
  @IsString()
  @Length(1, NAME_PART_MAX_LENGTH)
  family_name!: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  @IsEnum(['male', 'female'])
  gender!: StudentGender;

  @ApiProperty({
    required: false,
    format: 'date',
    example: '2015-06-01',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  dob?: string;

  @ApiProperty({ format: 'date', example: '2024-09-01' })
  @IsDateString()
  join_date!: string;

  @ApiProperty({
    required: false,
    enum: ['active', 'inactive', 'graduated'],
    example: 'active',
    description: 'Defaults to `active` when omitted.',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated'])
  status?: StudentStatus;

  @ApiProperty({
    required: false,
    example: 1.0,
    minimum: CAPACITY_LIMITS.hifz.min,
    maximum: CAPACITY_LIMITS.hifz.max,
    description: 'Daily Hifz memorisation target in pages. Defaults to 0.5.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.hifz.min)
  @Max(CAPACITY_LIMITS.hifz.max)
  daily_hifz_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 2.0,
    minimum: CAPACITY_LIMITS.near.min,
    maximum: CAPACITY_LIMITS.near.max,
    description: 'Daily near-review target in pages. Defaults to 2.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.near.min)
  @Max(CAPACITY_LIMITS.near.max)
  daily_near_pages_capacity?: number;

  @ApiProperty({
    required: false,
    example: 5.0,
    minimum: CAPACITY_LIMITS.far.min,
    maximum: CAPACITY_LIMITS.far.max,
    description: 'Daily far-review target in pages. Defaults to 5.',
  })
  @IsOptional()
  @IsNumber()
  @Min(CAPACITY_LIMITS.far.min)
  @Max(CAPACITY_LIMITS.far.max)
  daily_far_pages_capacity?: number;

  @ApiProperty({
    required: false,
    enum: ['ascending', 'descending'],
    example: 'descending',
    description:
      'اتجاه الحفظ — `descending` (تنازلي) starts at An-Nas and works backwards, ' +
      '`ascending` (تصاعدي) starts at Al-Fatihah. Defaults to `descending`.',
  })
  @IsOptional()
  @IsEnum(['ascending', 'descending'])
  memorization_direction?: MemorizationDirection;

  @ApiProperty({ required: false, example: 'Needs extra support on Juz 30.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/photos/1.jpg',
  })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    required: true,
    example: '300123456',
    maxLength: 20,
    description:
      'National ID number. Format is country-specific (Palestinian: 9 digits). ' +
      'A bad checksum is stored with a warning, not rejected. ' +
      'Unique per school (soft-deleted rows included in the constraint).',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  id_number!: string;

  @ApiProperty({
    required: false,
    example: '+970',
    maxLength: PHONE_COUNTRY_CODE_MAX_LENGTH,
    description:
      'Dial code of the student WhatsApp number, `+` followed by 1–4 digits. ' +
      'Must be sent together with `phone` — one without the other is a 400.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_COUNTRY_CODE_MAX_LENGTH)
  phone_country_code?: string;

  @ApiProperty({
    required: false,
    example: '599123456',
    maxLength: PHONE_NUMBER_MAX_LENGTH,
    description:
      'Student WhatsApp number without the dial code. A leading trunk `0` is stripped ' +
      'and Arabic-Indic digits are normalised before storage.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(PHONE_NUMBER_MAX_LENGTH)
  phone?: string;

  @ApiProperty({
    required: false,
    type: [LinkGuardianDto],
    description:
      'Guardians linked atomically in the same transaction. First entry is forced to is_primary=true.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LinkGuardianDto)
  guardians?: LinkGuardianDto[];
}
