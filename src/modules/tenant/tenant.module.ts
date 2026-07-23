import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { School } from './school.entity';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  imports: [TypeOrmModule.forFeature([School]), AuditModule],
  controllers: [SchoolController],
  providers: [SchoolService],
  exports: [TypeOrmModule, SchoolService],
})
export class TenantModule {}
