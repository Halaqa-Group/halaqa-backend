import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: config.get<string>('DB_HOST'),
    port: config.get<number>('DB_PORT'),
    username: config.get<string>('DB_USER'),
    password: config.get<string>('DB_PASS'),
    database: config.get<string>('DB_NAME'),
    synchronize: config.get<boolean>('DB_SYNCHRONIZE'),
    autoLoadEntities: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    extra: { connectionLimit: 10 },
  };
}
