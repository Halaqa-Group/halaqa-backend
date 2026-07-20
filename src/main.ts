import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const nodeEnv = config.get<string>('NODE_ENV');
  const corsOrigins = config.get<string>('CORS_ORIGINS', '');
  if (nodeEnv === 'development' || corsOrigins) {
    const origin = corsOrigins
      ? corsOrigins.split(',').map((o) => o.trim()).filter(Boolean)
      : ['http://127.0.0.1:3000', 'http://localhost:3000'];
    app.enableCors({ origin, credentials: true });
  }

  app.setGlobalPrefix('api');
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

  setupSwagger(app);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
