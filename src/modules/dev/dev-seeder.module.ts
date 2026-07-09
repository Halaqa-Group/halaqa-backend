import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchoolSchedule } from '../attendance/entities/school-schedule.entity';
import { Role } from '../roles/role.entity';
import { UserRole } from '../roles/user-role.entity';
import { School } from '../tenant/school.entity';
import { User } from '../users/entities/user.entity';
import { DevSeeder } from './dev-seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([School, User, Role, UserRole, SchoolSchedule]),
  ],
  providers: [DevSeeder],
})
export class DevSeederModule {}
