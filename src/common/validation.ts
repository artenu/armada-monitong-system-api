import { UnprocessableEntityException, ValidationError } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';

export interface FieldError {
  field: string;
  message: string;
}

/** Ratakan error class-validator (termasuk nested) menjadi [{ field, message }] */
export const flattenValidationErrors = (
  errors: ValidationError[],
  parent = '',
): FieldError[] =>
  errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });

/** Error validasi sesuai kontrak: 422 + daftar field yang salah */
export const validationException = (errors: FieldError[]) =>
  new UnprocessableEntityException({ message: 'Validasi gagal', errors });

/** Dipakai ValidationPipe global (main.ts) */
export const validationExceptionFactory = (errors: ValidationError[]) =>
  validationException(flattenValidationErrors(errors));

/**
 * Validasi "fleksibel" untuk payload yang strukturnya sering berubah mengikuti frontend
 * (OrderItem, payload operasional, invoice, master data).
 *
 * Field inti dicek tipenya lewat DTO, tetapi field lain TIDAK dibuang, sehingga
 * field baru dari frontend tetap tersimpan tanpa perubahan backend.
 */
export const validateFlexible = async <T extends object>(
  dto: ClassConstructor<T>,
  body: unknown,
  options: { skipMissing?: boolean } = {},
): Promise<Record<string, unknown>> => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validationException([
      { field: 'body', message: 'Body permintaan harus berupa objek JSON' },
    ]);
  }
  const instance = plainToInstance(dto, body);
  const errors = await validate(instance, {
    whitelist: false,
    skipMissingProperties: options.skipMissing ?? false,
  });
  if (errors.length > 0) {
    throw validationException(flattenValidationErrors(errors));
  }
  return body as Record<string, unknown>;
};

/** Buang field yang tidak boleh diubah langsung oleh klien */
export const omitKeys = (
  body: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(body).filter(([key]) => !keys.includes(key)),
  );
