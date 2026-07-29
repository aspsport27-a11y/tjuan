import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  SEED_OUTLET_CODE: z.string().default('main'),
  SEED_OUTLET_NAME: z.string().default('Outlet Utama'),
  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().default('change-this-password'),
  SEED_ADMIN_FULL_NAME: z.string().default('Administrator'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
