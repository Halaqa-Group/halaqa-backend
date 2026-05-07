import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Halaqa Backend API')
    .setDescription(
      'Authentication, user management, and school operations for the Halaqa system. ' +
        'All JSON responses are wrapped in a uniform envelope: ' +
        '`{ "code": <http>, "data": ... }` on success, ' +
        '`{ "code": <http>, "message": "..." }` on errors. ' +
        'Refresh tokens travel as HttpOnly cookies on `/auth/*`; access tokens use Bearer auth.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie' })
    .addTag('Auth', 'Login, refresh, logout, password reset')
    .addTag('Sessions', 'List and revoke active devices')
    .addTag(
      'Students',
      'Student CRUD, soft-delete/restore, and graduation. Visibility is role-scoped.',
    )
    .addTag(
      'Guardians',
      'Link, update, and unlink guardians for a student.',
    )
    .addTag('My Children', 'Parent-only views over their linked students.')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
