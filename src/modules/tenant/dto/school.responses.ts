import { ApiProperty } from '@nestjs/swagger';
import { School } from '../school.entity';
import type { SchoolStatus } from '../school.entity';

export class SchoolResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'مدرسة الفرقان لتحفيظ القرآن' })
  name!: string;

  @ApiProperty({ nullable: true, example: 'الخليل - شارع عين سارة' })
  address!: string | null;

  @ApiProperty({ nullable: true, example: '022221234' })
  phone!: string | null;

  @ApiProperty({ enum: ['active', 'inactive'], example: 'active' })
  status!: SchoolStatus;

  @ApiProperty({ example: 'Asia/Hebron' })
  timezone!: string;

  static fromEntity(s: School): SchoolResponse {
    const dto = new SchoolResponse();
    dto.id = s.id;
    dto.name = s.name;
    dto.address = s.address;
    dto.phone = s.phone;
    dto.status = s.status;
    dto.timezone = s.timezone;
    return dto;
  }
}
