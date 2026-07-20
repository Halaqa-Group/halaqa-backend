import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * One-time email-verification tokens. Same shape as `password_reset_tokens`:
 * store only the SHA-256 hash, one-time via `used_at`, cascade-delete with the
 * user. Consuming a token stamps `users.email_verified_at`.
 */
export class CreateEmailVerificationTokens1779600000000
  implements MigrationInterface
{
  name = 'CreateEmailVerificationTokens1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'email_verification_tokens',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'user_id', type: 'int', isNullable: false },
          { name: 'token_hash', type: 'char', length: '64', isNullable: false },
          {
            name: 'expires_at',
            type: 'datetime',
            precision: 6,
            isNullable: false,
          },
          {
            name: 'used_at',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'requested_ip',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          },
        ],
        indices: [
          { name: 'idx_evt_user', columnNames: ['user_id'] },
          {
            name: 'idx_evt_hash',
            columnNames: ['token_hash'],
            isUnique: true,
          },
        ],
        foreignKeys: [
          {
            name: 'FK_evt_user',
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('email_verification_tokens', true);
  }
}
