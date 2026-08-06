import { ApiProperty } from '@nestjs/swagger';
import { CAPACITY_UNITS, type StudentCapacityUnit } from '../capacity.config';

export class GuardianUserResponse {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'محمد', description: 'الاسم الأول' })
  first_name!: string;

  @ApiProperty({ example: 'أحمد', description: 'اسم الأب' })
  second_name!: string;

  @ApiProperty({ example: 'سالم', description: 'اسم الجد' })
  third_name!: string;

  @ApiProperty({ example: 'الحسني', description: 'اسم العائلة' })
  family_name!: string;

  @ApiProperty({
    example: 'محمد أحمد سالم الحسني',
    description: 'Read-only display name derived from the four name parts.',
  })
  name!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'parent@example.com',
    format: 'email',
  })
  email!: string | null;

  @ApiProperty({ nullable: true, example: '+970599000001' })
  phone!: string | null;
}

export class GuardianResponse {
  @ApiProperty({ type: GuardianUserResponse })
  user!: GuardianUserResponse;

  @ApiProperty({
    enum: [
      'father',
      'mother',
      'grandfather',
      'grandmother',
      'uncle',
      'aunt',
      'sibling',
      'other',
    ],
    example: 'father',
  })
  relation!: string;

  @ApiProperty({
    example: true,
    description: 'Exactly one guardian per student has this set.',
  })
  is_primary!: boolean;

  @ApiProperty({ example: true })
  can_pickup!: boolean;
}

export class StudentResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'يوسف', description: 'الاسم الأول' })
  first_name!: string;

  @ApiProperty({ example: 'محمد', description: 'اسم الأب' })
  second_name!: string;

  @ApiProperty({ example: 'أحمد', description: 'اسم الجد' })
  third_name!: string;

  @ApiProperty({ example: 'الحسني', description: 'اسم العائلة' })
  family_name!: string;

  @ApiProperty({
    example: 'يوسف محمد أحمد الحسني',
    description: 'Read-only display name derived from the four name parts.',
  })
  name!: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  gender!: string;

  @ApiProperty({ nullable: true, format: 'date', example: '2015-06-01' })
  dob!: string | null;

  @ApiProperty({ format: 'date', example: '2024-09-01' })
  join_date!: string;

  @ApiProperty({ enum: ['active', 'inactive', 'graduated'], example: 'active' })
  status!: string;

  @ApiProperty({
    example: '1.00',
    description:
      'Daily Hifz memorisation target (0–20), counted in `daily_hifz_capacity_unit`.',
  })
  daily_hifz_pages_capacity!: string;

  @ApiProperty({
    enum: CAPACITY_UNITS,
    example: 'page',
    description: 'وحدة قدرة الحفظ.',
  })
  daily_hifz_capacity_unit!: string;

  @ApiProperty({
    example: '2.00',
    description:
      'Daily near-review target (0–50), counted in `daily_near_capacity_unit`.',
  })
  daily_near_pages_capacity!: string;

  @ApiProperty({
    enum: CAPACITY_UNITS,
    example: 'page',
    description: 'وحدة قدرة المراجعة القريبة.',
  })
  daily_near_capacity_unit!: string;

  @ApiProperty({
    example: '5.00',
    description:
      'Daily far-review target (0–100), counted in `daily_far_capacity_unit`.',
  })
  daily_far_pages_capacity!: string;

  @ApiProperty({
    enum: CAPACITY_UNITS,
    example: 'page',
    description: 'وحدة قدرة المراجعة البعيدة.',
  })
  daily_far_capacity_unit!: string;

  @ApiProperty({
    enum: ['ascending', 'descending'],
    example: 'descending',
    description:
      'اتجاه الحفظ — `descending` (تنازلي) starts at An-Nas and works backwards, ' +
      '`ascending` (تصاعدي) starts at Al-Fatihah.',
  })
  memorization_direction!: string;

  @ApiProperty({ nullable: true, example: 'Needs extra support on Juz 30.' })
  notes!: string | null;

  @ApiProperty({
    nullable: true,
    example: 'https://cdn.example.com/photos/1.jpg',
  })
  photo_url!: string | null;

  @ApiProperty({
    nullable: true,
    example: '300123456',
    description:
      'National ID number. Always present when you can see the student. ' +
      'Value is null for legacy students created before this field was required.',
  })
  id_number!: string | null;

  @ApiProperty({
    nullable: true,
    example: '+970',
    description: 'Dial code of the student WhatsApp number.',
  })
  phone_country_code!: string | null;

  @ApiProperty({
    nullable: true,
    example: '599123456',
    description: 'Student WhatsApp number without the dial code.',
  })
  phone!: string | null;

  @ApiProperty({
    nullable: true,
    example: '+970599123456',
    description:
      'The two fields above joined, ready for a wa.me link. Null unless both are set.',
  })
  phone_e164!: string | null;
}

export class StudentDetailResponse extends StudentResponse {
  @ApiProperty({ type: [GuardianResponse] })
  guardians!: GuardianResponse[];
}

export class StudentListData {
  @ApiProperty({ type: [StudentResponse] })
  items!: StudentResponse[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class StudentEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: StudentResponse })
  data!: StudentResponse;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['id_number.checksum_invalid'],
    description:
      'Non-fatal warnings. Present only when id_number validation produced warnings.',
  })
  warnings?: string[];
}

export class StudentDetailEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: StudentDetailResponse })
  data!: StudentDetailResponse;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['id_number.checksum_invalid'],
    description:
      'Non-fatal warnings. Present only when id_number validation produced warnings.',
  })
  warnings?: string[];
}

export class StudentListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: StudentListData })
  data!: StudentListData;
}

export class GuardianEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: GuardianResponse })
  data!: GuardianResponse;
}

export class GuardianListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: [GuardianResponse] })
  data!: GuardianResponse[];
}

// Plain interfaces kept for service-layer compatibility
export type PersonNameView = {
  first_name: string;
  second_name: string;
  third_name: string;
  family_name: string;
  /** Derived by the database from the four parts above; never written directly. */
  name: string;
};

export type GuardianView = {
  user: PersonNameView & {
    id: number;
    email: string | null;
    phone: string | null;
  };
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
};

export type StudentView = PersonNameView & {
  id: number;
  gender: string;
  dob: string | null;
  join_date: string;
  status: string;
  daily_hifz_pages_capacity: string;
  daily_hifz_capacity_unit: StudentCapacityUnit;
  daily_near_pages_capacity: string;
  daily_near_capacity_unit: StudentCapacityUnit;
  daily_far_pages_capacity: string;
  daily_far_capacity_unit: StudentCapacityUnit;
  memorization_direction: string;
  notes: string | null;
  photo_url: string | null;
  id_number: string | null;
  phone_country_code: string | null;
  phone: string | null;
  /** `phone_country_code` + `phone`, or null when the number is unset. */
  phone_e164: string | null;
};

export type StudentDetailView = StudentView & { guardians: GuardianView[] };

export type StudentListResult = {
  items: StudentView[];
  total: number;
  page: number;
  limit: number;
};
