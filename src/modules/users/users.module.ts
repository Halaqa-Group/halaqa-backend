import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ID_NUMBER_VALIDATOR } from '../../common/validators/id-number-validator.interface';
import { PalestinianIdValidator } from '../../common/validators/palestinian-id.validator';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { RolesModule } from '../roles/roles.module';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken]), RolesModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: ID_NUMBER_VALIDATOR, useClass: PalestinianIdValidator },
  ],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
