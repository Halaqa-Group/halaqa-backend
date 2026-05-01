import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { School } from './school.entity';

@Module({
  imports: [TypeOrmModule.forFeature([School])],
  exports: [TypeOrmModule],
})
export class TenantModule {}
