import { ApiProperty } from '@nestjs/swagger';

export class GuardianUserResponse {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: 'محمد أبو أحمد' })
  name!: string;

  @ApiProperty({ example: 'parent@example.com', format: 'email' })
  email!: string;

  @ApiProperty({ nullable: true, example: '+970599000001' })
  phone!: string | null;
}

export class GuardianResponse {
  @ApiProperty({ type: GuardianUserResponse })
  user!: GuardianUserResponse;

  @ApiProperty({
    enum: ['father', 'mother', 'grandfather', 'grandmother', 'uncle', 'aunt', 'sibling', 'other'],
    example: 'father',
  })
  relation!: string;

  @ApiProperty({ example: true, description: 'Exactly one guardian per student has this set.' })
  is_primary!: boolean;

  @ApiProperty({ example: true })
  can_pickup!: boolean;
}

export class StudentResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'يوسف محمد' })
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
    description: 'Daily Hifz memorisation target in pages (0–20).',
  })
  daily_hifz_pages_capacity!: string;

  @ApiProperty({
    example: '2.00',
    description: 'Daily near-review target in pages (0–50).',
  })
  daily_near_pages_capacity!: string;

  @ApiProperty({
    example: '5.00',
    description: 'Daily far-review target in pages (0–100).',
  })
  daily_far_pages_capacity!: string;

  @ApiProperty({ nullable: true, example: 'Needs extra support on Juz 30.' })
  notes!: string | null;

  @ApiProperty({ nullable: true, example: 'https://cdn.example.com/photos/1.jpg' })
  photo_url!: string | null;

  @ApiProperty({
    nullable: true,
    example: '300123456',
    description:
      'National ID number. Always present when you can see the student. ' +
      'Value is null for legacy students created before this field was required.',
  })
  id_number!: string | null;
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
    description: 'Non-fatal warnings. Present only when id_number validation produced warnings.',
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
    description: 'Non-fatal warnings. Present only when id_number validation produced warnings.',
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
export type GuardianView = {
  user: { id: number; name: string; email: string; phone: string | null };
  relation: string;
  is_primary: boolean;
  can_pickup: boolean;
};

export type StudentView = {
  id: number;
  name: string;
  gender: string;
  dob: string | null;
  join_date: string;
  status: string;
  daily_hifz_pages_capacity: string;
  daily_near_pages_capacity: string;
  daily_far_pages_capacity: string;
  notes: string | null;
  photo_url: string | null;
  id_number: string | null;
};

export type StudentDetailView = StudentView & { guardians: GuardianView[] };

export type StudentListResult = {
  items: StudentView[];
  total: number;
  page: number;
  limit: number;
};
