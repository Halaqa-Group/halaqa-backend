import { NestFactory } from '@nestjs/core';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

const COMMITTED = resolve(process.cwd(), 'docs', 'openapi.json');

async function main(): Promise<void> {
  if (!existsSync(COMMITTED)) {
    process.stderr.write(
      `docs/openapi.json is missing. Run \`pnpm docs:export\` and commit it.\n`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { logger: false });
  const fresh = JSON.stringify(buildOpenApiDocument(app), null, 2);
  await app.close();

  const committed = readFileSync(COMMITTED, 'utf8').replace(/\r\n/g, '\n');
  const expected = fresh.replace(/\r\n/g, '\n');

  if (committed.trimEnd() === expected.trimEnd()) {
    process.stdout.write('OpenAPI spec is up to date.\n');
    return;
  }

  process.stderr.write(
    'OpenAPI spec is stale.\n' +
      `  expected ${expected.length} bytes, committed ${committed.length} bytes\n` +
      '  fix: pnpm docs:export && git add docs/openapi.json\n',
  );
  process.exit(1);
}

void main().catch((err: unknown) => {
  process.stderr.write(
    `OpenAPI check failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
