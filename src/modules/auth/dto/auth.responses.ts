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
