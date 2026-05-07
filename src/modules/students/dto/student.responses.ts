import { ApiProperty } from '@nestjs/swagger';

export class GuardianUserView {
  @ApiProperty({ example: 42 })
  id!: number;

  @ApiProperty({ example: 'أبو محمد' })
  name!: string;

  @ApiProperty({ example: 'parent@school.com', format: 'email' })
  email!: string;

  @ApiProperty({ nullable: true, example: '+970599123456' })
  phone!: string | null;
}

export class GuardianView {
  @ApiProperty({ type: GuardianUserView })
  user!: GuardianUserView;

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
    description: 'At most one primary guardian per student (BR-STD-04).',
  })
  is_primary!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether this guardian is allowed to pick the student up.',
  })
  can_pickup!: boolean;
}

export class StudentView {
  @ApiProperty({ example: 7 })
  id!: number;

  @ApiProperty({ example: 'محمد أحمد' })
  name!: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'male' })
  gender!: string;

  @ApiProperty({
    nullable: true,
    example: '2012-04-15',
    description: 'ISO date (YYYY-MM-DD), or null if unknown.',
  })
  dob!: string | null;

  @ApiProperty({ example: '2024-09-01' })
  join_date!: string;

  @ApiProperty({ enum: ['active', 'inactive', 'graduated'], example: 'active' })
  status!: string;

  @ApiProperty({
    example: '1',
    description: 'Stringified decimal — pages per day for hifz (new memorization).',
  })
  daily_hifz_pages_capacity!: string;

  @ApiProperty({
    example: '5',
    description: 'Stringified decimal — pages per day for near revision.',
  })
  daily_near_pages_capacity!: string;

  @ApiProperty({
    example: '10',
    description: 'Stringified decimal — pages per day for far revision.',
  })
  daily_far_pages_capacity!: string;

  @ApiProperty({ nullable: true, example: null })
  notes!: string | null;

  @ApiProperty({ nullable: true, example: null })
  photo_url!: string | null;
}

export class StudentDetailView extends StudentView {
  @ApiProperty({ type: [GuardianView] })
  guardians!: GuardianView[];
}

export class StudentListResult {
  @ApiProperty({ type: [StudentView] })
  items!: StudentView[];

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

  @ApiProperty({ type: StudentDetailView })
  data!: StudentDetailView;
}

export class StudentListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: StudentListResult })
  data!: StudentListResult;
}

export class GuardianListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: [GuardianView] })
  data!: GuardianView[];
}

export class GuardianEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: GuardianView })
  data!: GuardianView;
}
