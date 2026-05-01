import { ConfigService } from '@nestjs/config';
import { buildTypeOrmOptions } from './typeorm.config';

function makeConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T>(key: string): T | undefined => values[key] as T | undefined,
  } as ConfigService;
}

describe('buildTypeOrmOptions', () => {
  it('maps env values to a mysql connection options object', () => {
    const opts = buildTypeOrmOptions(
      makeConfig({
        DB_HOST: 'localhost',
        DB_PORT: 3306,
        DB_USER: 'root',
        DB_PASS: 'secret',
        DB_NAME: 'halaqa',
        DB_SYNCHRONIZE: false,
      }),
    );

    expect(opts).toMatchObject({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'secret',
      database: 'halaqa',
      synchronize: false,
      autoLoadEntities: true,
      charset: 'utf8mb4',
      timezone: 'Z',
    });
  });

  it('passes DB_SYNCHRONIZE through verbatim so dev can opt in and prod cannot', () => {
    const dev = buildTypeOrmOptions(makeConfig({ DB_SYNCHRONIZE: true }));
    const prod = buildTypeOrmOptions(makeConfig({ DB_SYNCHRONIZE: false }));

    expect(dev.synchronize).toBe(true);
    expect(prod.synchronize).toBe(false);
  });
});
