import { ApiProperty } from '@nestjs/swagger';

export class UserResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'أحمد', description: 'الاسم الأول' })
  firstName!: string;

  @ApiProperty({ example: 'محمد', description: 'اسم الأب' })
  secondName!: string;

  @ApiProperty({ example: 'علي', description: 'اسم الجد' })
  thirdName!: string;

  @ApiProperty({ example: 'المدير', description: 'اسم العائلة' })
  familyName!: string;

  @ApiProperty({
    example: 'أحمد محمد علي المدير',
    description: 'Read-only display name derived from the four name parts.',
  })
  name!: string;

  @ApiProperty({ example: '400000006', description: 'National ID number.' })
  idNumber!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'admin@school.com',
    format: 'email',
    description: 'Null when the user was created without an email.',
  })
  email!: string | null;

  @ApiProperty({ nullable: true, example: '+970599123456' })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  status!: 'active' | 'inactive' | 'suspended';

  @ApiProperty({
    type: [String],
    description: 'Flat list of role slugs.',
    example: ['principal'],
  })
  roles!: string[];

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description:
      'When the user proved ownership of `email` via a verification link. Null while unverified.',
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastLoginAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class UserEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: UserResponse })
  data!: UserResponse;
}

export class UserListData {
  @ApiProperty({ type: [UserResponse] })
  items!: UserResponse[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class UserListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: UserListData })
  data!: UserListData;
}
