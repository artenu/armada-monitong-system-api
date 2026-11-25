import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** "YYYY-MM-DD" atau "YYYY-MM-DDTHH:mm..." */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const dateMessage = (label: string) => `${label} harus berformat YYYY-MM-DD`;

/**
 * DTO "inti" order: hanya field yang dicek tipenya.
 * Field lain dari OrderItem frontend tetap diterima dan disimpan (validasi fleksibel).
 */
export class OrderCoreDto {
  @IsString({ message: 'Customer wajib diisi' })
  @MinLength(1, { message: 'Customer wajib diisi' })
  customer!: string;

  @IsString({ message: 'Layanan wajib diisi' })
  @MinLength(1, { message: 'Layanan wajib diisi' })
  service!: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Tanggal mulai') })
  startDate?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Estimasi tonase harus berupa angka' })
  @Min(0, { message: 'Estimasi tonase tidak boleh negatif' })
  estimatedTonnage?: number;

  @IsOptional()
  @IsString()
  vessel?: string;
}

export class OperationalCoreDto {
  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Final DSR harus berupa angka' })
  @Min(0, { message: 'Final DSR tidak boleh negatif' })
  finalDsr?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class InvoiceCoreDto {
  @IsString({ message: 'Nomor invoice wajib diisi' })
  @MinLength(1, { message: 'Nomor invoice wajib diisi' })
  invoiceNo!: string;

  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Tanggal invoice') })
  invoiceDate!: string;

  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Jatuh tempo') })
  dueDate!: string;

  @IsNumber({}, { message: 'Total invoice harus berupa angka' })
  @Min(0, { message: 'Total invoice tidak boleh negatif' })
  totalInvoice!: number;
}

/** Konfirmasi Selesai Muat/Bongkar (struktur tetap) */
export class CompleteOperationDto {
  @ApiProperty({ example: '2026-11-25' })
  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Tanggal selesai') })
  completeDate!: string;

  @ApiProperty({ example: 7500 })
  @IsNumber({}, { message: 'Final DSR harus berupa angka' })
  @Min(0, { message: 'Final DSR tidak boleh negatif' })
  finalDsr!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBongkar?: boolean;
}

export class MarkReceivedDto {
  @ApiPropertyOptional({ example: '2026-11-25' })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Tanggal diterima') })
  receivedDate?: string;
}

export class ConfirmPaymentDto {
  @ApiProperty({ example: '2026-11-25' })
  @IsString()
  @Matches(DATE_PATTERN, { message: dateMessage('Tanggal pembayaran') })
  paymentDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentNotes?: string;
}
