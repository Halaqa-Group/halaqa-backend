import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class AssignSupervisorDto {
  @ApiProperty({ example: 5, description: 'Must be a user in this school with the supervisor role.' })
  @IsInt()
  @IsPositive()
  supervisor_user_id!: number;
}
