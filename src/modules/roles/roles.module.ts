import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { RolesSeeder } from './roles.seeder';
import { UserRole } from './user-role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole])],
  providers: [RolesSeeder],
  exports: [TypeOrmModule],
})
export class RolesModule {}
