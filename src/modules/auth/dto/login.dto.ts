import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Log in with EITHER `email` or `id_number` (national ID), plus `password`.
 * Exactly one identifier is required: `email` is validated when `id_number`
 * is absent, and vice-versa — so omitting both fails validation.
 */
export class LoginDto {
  @ApiPropertyOptional({
    example: 'admin@school.com',
    format: 'email',
    description: 'Required when `id_number` is not provided.',
  })
  @ValidateIf((o: LoginDto) => o.id_number === undefined || o.id_number === '')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '400000006',
    description: 'National ID number. Required when `email` is not provided.',
  })
  @ValidateIf((o: LoginDto) => o.email === undefined || o.email === '')
  @IsString()
  @IsNotEmpty()
  id_number?: string;

  @ApiProperty({ example: 'Passw0rd!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({
    description:
      'When true, issues a long-lived refresh cookie (`JWT_REFRESH_TTL_DAYS`). ' +
      'When false or absent, the cookie is short-lived (`JWT_REFRESH_TTL_DAYS_DEFAULT`).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
