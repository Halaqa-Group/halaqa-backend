import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';

  // Trust N reverse-proxy hops so req.ip is the real client, not the proxy.
  // Required for IP-based login rate limiting to work behind nginx/ALB.
  app.set('trust proxy', config.get<number>('TRUST_PROXY', 0));

  // Security headers (CSP, HSTS, X-Frame-Options, ...).
  app.use(helmet());

  app.enableCors(buildCorsOptions(config, isProd));

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Close DB pool, cron jobs, and in-flight requests cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  setupSwagger(app);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

/**
 * Whitelist origins from CORS_ORIGINS. When unset: dev falls back to the local
 * frontend (Nuxt on :3000); production denies cross-origin.
 */
function buildCorsOptions(config: ConfigService, isProd: boolean) {
  const origins = (config.get<string>('CORS_ORIGINS', '') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length > 0) return { origin: origins, credentials: true };

  return {
    origin: isProd ? false : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  };
}

void bootstrap();
