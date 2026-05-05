import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Halaqa } from './entities/halaqa.entity';
import { HalaqaTeacher } from './entities/halaqa-teacher.entity';
import { StudentHalaqa } from './entities/student-halaqa.entity';
import { SupervisorHalaqa } from './entities/supervisor-halaqa.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Halaqa,
      StudentHalaqa,
      HalaqaTeacher,
      SupervisorHalaqa,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class HalaqatModule {}
