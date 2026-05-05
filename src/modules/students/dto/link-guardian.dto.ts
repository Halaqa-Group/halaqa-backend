import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import type { GuardianRelation } from '../entities/student-guardian.entity';

export class LinkGuardianDto {
  @ValidateIf((o: LinkGuardianDto) => !o.email)
  @IsNumber()
  guardian_user_id?: number;

  @ValidateIf((o: LinkGuardianDto) => !o.guardian_user_id)
  @IsEmail()
  email?: string;

  @ValidateIf(
    (o: LinkGuardianDto) =>
      o.email !== undefined && o.guardian_user_id === undefined,
  )
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum([
    'father',
    'mother',
    'grandfather',
    'grandmother',
    'uncle',
    'aunt',
    'sibling',
    'other',
  ])
  relation!: GuardianRelation;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @IsOptional()
  @IsBoolean()
  can_pickup?: boolean;
}
