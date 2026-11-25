import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ActiveStatus, UserRole } from '../../generated/prisma/client.js';

export const USER_ROLES = Object.values(UserRole);
export const ACTIVE_STATUSES = Object.values(ActiveStatus);
export const MIN_PASSWORD_LENGTH = 8;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const isProvided = (_: object, value: unknown) => value !== undefined;

export class CreateUserDto {
  @ApiProperty({ example: 'Budi Santoso' })
  @Transform(trim)
  @IsString({ message: 'Nama wajib diisi' })
  @MinLength(1, { message: 'Nama wajib diisi' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'budi@armada.local' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid' })
  email!: string;

  @ApiProperty({ enum: USER_ROLES })
  @IsIn(USER_ROLES, {
    message: `Role harus salah satu dari: ${USER_ROLES.join(', ')}`,
  })
  role!: UserRole;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @ValidateIf(isProvided)
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus Aktif atau Nonaktif' })
  status?: ActiveStatus;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH })
  @IsString({ message: 'Password wajib diisi' })
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password minimal ${MIN_PASSWORD_LENGTH} karakter`,
  })
  @MaxLength(128)
  password!: string;
}

/** Semua field opsional; password kosong/tidak dikirim = tidak diubah */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Nama tidak boleh kosong' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Format email tidak valid' })
  email?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @ValidateIf(isProvided)
  @IsIn(USER_ROLES, {
    message: `Role harus salah satu dari: ${USER_ROLES.join(', ')}`,
  })
  role?: UserRole;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(120)
  department?: string;

  @ApiPropertyOptional()
  @ValidateIf(isProvided)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES })
  @ValidateIf(isProvided)
  @IsIn(ACTIVE_STATUSES, { message: 'Status harus Aktif atau Nonaktif' })
  status?: ActiveStatus;

  @ApiPropertyOptional({ minLength: MIN_PASSWORD_LENGTH })
  @ValidateIf(
    (_, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Password minimal ${MIN_PASSWORD_LENGTH} karakter`,
  })
  @MaxLength(128)
  password?: string;
}
