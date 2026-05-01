import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const doc = buildOpenApiDocument(app);
  const out = resolve(process.cwd(), 'docs', 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  await app.close();
  process.stdout.write(`wrote ${out}\n`);
}

void main();
