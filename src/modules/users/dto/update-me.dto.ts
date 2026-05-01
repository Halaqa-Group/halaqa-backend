import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Self-edit whitelist (BR-USR-06). Email, school_id, status, and roles are
 * intentionally absent — those need a principal-driven endpoint. With
 * `forbidNonWhitelisted: true` on the global ValidationPipe, sending any
 * other field returns 400.
 */
export class UpdateMeDto {
  @ApiProperty({ required: false, example: 'أحمد', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiProperty({ required: false, example: '+970599123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo_url?: string;
}
