import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Comma-separated list of allowed browser origins (e.g. "https://app.halaqa.ps,https://admin.halaqa.ps").
  // Empty/unset: in non-production every origin is reflected; in production cross-origin is denied.
  CORS_ORIGINS: Joi.string().allow('').default(''),
  // Number of reverse-proxy hops to trust for the client IP (X-Forwarded-For).
  // 0 = trust none (direct exposure). Behind one nginx/ALB set 1, else rate limiting sees the proxy IP.
  TRUST_PROXY: Joi.number().integer().min(0).default(0),

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
  // Refresh cookie lifetime when the login's `rememberMe` flag is false/absent.
  JWT_REFRESH_TTL_DAYS_DEFAULT: Joi.number().integer().positive().default(1),

  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),

  COOKIE_SECURE: Joi.boolean().default(false),

  APP_URL: Joi.string().uri().required(),
  MAIL_FROM: Joi.string().required(),
  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
});
