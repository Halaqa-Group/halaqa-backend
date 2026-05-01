import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { Match } from '../../../common/validators/match.decorator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password — required to authorise the change.',
  })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ description: 'Must match `password`.' })
  @IsString()
  @Match('password', {
    message: 'password_confirmation must match password',
  })
  password_confirmation!: string;
}
