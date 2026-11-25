import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Validasi environment variable saat aplikasi start (Standar Artenu v2.3 bagian 11).
 * Aplikasi berhenti dengan pesan jelas bila ada variabel wajib yang hilang atau salah.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 8000;

  @IsString()
  @MinLength(1, { message: 'DATABASE_URL wajib diisi' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, {
    message:
      'JWT_ACCESS_SECRET minimal 32 karakter (buat dengan: openssl rand -base64 48)',
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 7;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  COOKIE_SECURE = true;

  /** Daftar origin frontend yang diizinkan, dipisah koma */
  @IsOptional()
  @IsString()
  CORS_ORIGINS = '';

  /** Zona waktu bisnis untuk "hari ini" dan tampilan waktu (Standar v2.3 bagian 9.2) */
  @IsString()
  APP_TIMEZONE = 'Asia/Makassar';

  @IsString()
  UPLOAD_DIR = 'uploads';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  MAX_UPLOAD_MB = 25;
}

export const validateEnv = (config: Record<string, unknown>) => {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `- ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Konfigurasi .env tidak valid:\n${details}`);
  }
  return validated;
};
