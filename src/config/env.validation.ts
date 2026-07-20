import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),

  DEFAULT_SCHOOL_ID: Joi.number().integer().positive().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().positive().default(30),

  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),

  COOKIE_SECURE: Joi.boolean().default(false),

  /** Comma-separated browser origins allowed for CORS (credentials). Empty = no extra CORS (dev still enables defaults in main.ts). */
  CORS_ORIGINS: Joi.string().allow('').optional(),

  APP_URL: Joi.string().uri().required(),
  MAIL_FROM: Joi.string().required(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
});
