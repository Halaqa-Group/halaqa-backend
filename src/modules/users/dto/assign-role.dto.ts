import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({
    example: 4,
    description: 'Numeric role id (see /roles seed).',
  })
  @IsInt()
  @Min(1)
  roleId!: number;
}
