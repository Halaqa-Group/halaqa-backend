import { ApiProperty } from '@nestjs/swagger';

export class RoleResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({
    enum: ['principal', 'vice_principal', 'supervisor', 'teacher', 'parent'],
    example: 'principal',
  })
  slug!: string;

  @ApiProperty({ example: 'مدير' })
  nameAr!: string;

  @ApiProperty({ example: 'Principal' })
  nameEn!: string;

  @ApiProperty({ example: 100 })
  level!: number;
}

export class RoleListEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: [RoleResponse] })
  data!: RoleResponse[];
}
