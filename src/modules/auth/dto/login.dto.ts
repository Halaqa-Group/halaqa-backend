import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@school.com', format: 'email' })
  @IsEmail()
  email!: string;

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
