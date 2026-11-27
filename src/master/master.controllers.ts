import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ResponseMessage } from '../common/response.interceptor.js';
import { MasterService } from './master.service.js';

const FLEXIBLE_BODY = {
  schema: { type: 'object', additionalProperties: true },
} as const;

/*
 * Catatan urutan route: controller dengan path statis (contract-rates, pnbp-rates)
 * didaftarkan SEBELUM `master/:resource` di MasterModule, agar tidak tertangkap sebagai resource.
 * Baca: semua user login (dropdown form). Tulis: admin.
 */

@ApiTags('Master Data')
@ApiBearerAuth()
@Controller('master/contract-rates')
export class ContractRatesController {
  constructor(private readonly master: MasterService) {}

  @Get()
  findAll() {
    return this.master.findContractRates();
  }

  @Post()
  @HttpCode(200)
  @Roles('admin')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Tarif kontrak berhasil disimpan')
  save(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.master.saveContractRate(body, user);
  }

  @Delete(':id')
  @Roles('admin')
  @ResponseMessage('Tarif kontrak berhasil dihapus')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.master.deleteContractRate(id, user);
  }
}

@ApiTags('Master Data')
@ApiBearerAuth()
@Controller('master/pnbp-rates')
export class PnbpRatesController {
  constructor(private readonly master: MasterService) {}

  @Get()
  findAll() {
    return this.master.findPnbpRates();
  }

  @Post()
  @HttpCode(200)
  @Roles('admin')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Tarif PNBP berhasil disimpan')
  save(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.master.savePnbpRate(body, user);
  }

  @Delete(':id')
  @Roles('admin')
  @ResponseMessage('Tarif PNBP berhasil dihapus')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.master.deletePnbpRate(id, user);
  }
}

@ApiTags('Master Data')
@ApiBearerAuth()
@Controller('master')
export class MasterController {
  constructor(private readonly master: MasterService) {}

  /** Semua jenis master sekaligus: { customer: [...], 'tug-boat': [...], ... } */
  @Get()
  findAllResources() {
    return this.master.findAllResources();
  }

  @Get(':resource')
  findItems(@Param('resource') resource: string) {
    return this.master.findItems(resource);
  }

  /**
   * Admin/direktur: tambah & ubah. Sales/operasional: hanya TAMBAH item baru
   * (quick add dari form order); ID & kode dibuat server, nama yang sudah ada dipakai ulang.
   */
  @Post(':resource')
  @HttpCode(200)
  @Roles('admin', 'sales', 'sales_ops', 'operasional')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Data master berhasil disimpan')
  save(
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.master.saveItem(resource, body, user);
  }

  @Delete(':resource/:id')
  @Roles('admin')
  @ResponseMessage('Data master berhasil dihapus')
  remove(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.master.deleteItem(resource, id, user);
  }
}
