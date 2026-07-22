import { ApiProperty } from '@nestjs/swagger';

export class AuthUserResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'أحمد المدير' })
  name!: string;

  @ApiProperty({ example: 'admin@school.com', format: 'email' })
  email!: string;

  @ApiProperty({
    type: [String],
    example: ['principal'],
    description: 'Flat array of role slugs the user holds.',
  })
  roles!: string[];
}

export class AuthSuccessData {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'JWT access token (HS256, 15 min). Use as `Authorization: Bearer <token>`.',
  })
  accessToken!: string;

  @ApiProperty({ type: AuthUserResponse })
  user!: AuthUserResponse;
}

export class AuthSuccessEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: AuthSuccessData })
  data!: AuthSuccessData;
}

export class ErrorEnvelope {
  @ApiProperty({ example: 401 })
  code!: number;

  @ApiProperty({ example: 'Invalid credentials' })
  message!: string;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Validation error list (only on 400 with multiple field errors).',
  })
  details?: string[];
}

/** 429 error envelope: same shape as {@link ErrorEnvelope} plus the retry hint. */
export class ThrottledEnvelope {
  @ApiProperty({ example: 429 })
  code!: number;

  @ApiProperty({
    example: 'Too many attempts. Please try again later.',
    description:
      'Identical for every kind of block, so it never reveals which limit was hit.',
  })
  message!: string;

  @ApiProperty({
    example: 900,
    description:
      'Seconds to wait before retrying. Mirrors the `Retry-After` response header.',
  })
  retry_after_seconds!: number;
}

export class SessionResponse {
  @ApiProperty({ example: '42' })
  id!: string;

  @ApiProperty({ nullable: true, example: null })
  deviceName!: string | null;

  @ApiProperty({
    enum: ['web', 'mobile_ios', 'mobile_android', 'desktop', 'other'],
    example: 'web',
  })
  deviceType!: string;

  @ApiProperty({ nullable: true, example: '1.2.3.4' })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  issuedAt!: Date;

  @ApiProperty({
    example: true,
    description:
      'True for the device that owns the cookie on the current request.',
  })
  current!: boolean;
}

export class SessionsEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: [SessionResponse] })
  data!: SessionResponse[];
}

export class MessageEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ example: 'A reset link has been sent.' })
  message!: string;
}

export class ValidateResetTokenData {
  @ApiProperty({ example: 'admin@school.com', format: 'email' })
  email!: string;
}

export class ValidateResetTokenEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: ValidateResetTokenData })
  data!: ValidateResetTokenData;
}

export class MeResponse {
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

  @ApiProperty({ example: 'admin@school.com', format: 'email' })
  email!: string;

  @ApiProperty({ nullable: true, example: '+970599123456' })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty({
    type: [String],
    example: ['principal'],
    description:
      'Flat list of role slugs. Authorization is role-based — there is no `permissions` field.',
  })
  roles!: string[];
}

export class MeEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: MeResponse })
  data!: MeResponse;
}
