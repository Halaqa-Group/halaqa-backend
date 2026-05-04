import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { RolesController } from './roles.controller';
import { RolesSeeder } from './roles.seeder';
import { UserRole } from './user-role.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role, UserRole])],
  controllers: [RolesController],
  providers: [RolesSeeder],
  exports: [TypeOrmModule],
})
export class RolesModule {}
