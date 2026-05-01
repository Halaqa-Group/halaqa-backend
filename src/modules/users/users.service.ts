import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * Sets the user's password hash and increments token_version atomically.
   * Bumping token_version invalidates outstanding access tokens on the next
   * request via JwtStrategy's tv check (BR-AUTH-08, BR-USR-07). The caller is
   * responsible for revoking refresh tokens separately.
   */
  async setPasswordAndBumpVersion(
    userId: number,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager?.getRepository(User) ?? this.users;
    await repo
      .createQueryBuilder()
      .update(User)
      .set({
        password: passwordHash,
        tokenVersion: () => 'token_version + 1',
      })
      .where('id = :id', { id: userId })
      .execute();
  }
}
