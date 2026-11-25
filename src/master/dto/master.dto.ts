import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const STATUSES = ['Aktif', 'Nonaktif'];
const statusMessage = 'Status harus Aktif atau Nonaktif';

/** Field inti master item; field lain (NPWP, PIC, dll) tetap disimpan apa adanya */
export class MasterItemCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  kode?: string;

  @IsString({ message: 'Nama wajib diisi' })
  @MinLength(1, { message: 'Nama wajib diisi' })
  @MaxLength(200)
  nama!: string;

  @IsOptional()
  @IsIn(STATUSES, { message: statusMessage })
  status?: string;
}

export class ContractRateCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  @IsString({ message: 'Nama customer wajib diisi' })
  @MinLength(1, { message: 'Nama customer wajib diisi' })
  customerName!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsIn(STATUSES, { message: statusMessage })
  status?: string;
}

export class PnbpRateCoreDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  @IsString({ message: 'Nama pelabuhan wajib diisi' })
  @MinLength(1, { message: 'Nama pelabuhan wajib diisi' })
  portName!: string;

  @IsOptional()
  @IsNumber({}, { message: 'Tarif harus berupa angka' })
  @Min(0)
  barangEksporPerTon?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Tarif harus berupa angka' })
  @Min(0)
  barangDomestikPerTon?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Tarif harus berupa angka' })
  @Min(0)
  pengawasanPerTon?: number;

  @IsOptional()
  @IsIn(STATUSES, { message: statusMessage })
  status?: string;
}
