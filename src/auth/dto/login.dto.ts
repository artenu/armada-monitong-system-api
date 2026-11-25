import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sales@armada.local' })
  @IsEmail({}, { message: 'Format email tidak valid' })
  email!: string;

  @ApiProperty({ example: 'password-anda' })
  @IsString({ message: 'Password wajib diisi' })
  @MinLength(1, { message: 'Password wajib diisi' })
  password!: string;
}
