import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ResponseMessage } from '../common/response.interceptor.js';
import { BillingService } from './billing.service.js';
import {
  CompleteOperationDto,
  ConfirmPaymentDto,
  MarkReceivedDto,
} from './dto/order.dto.js';
import { OperationalService } from './operational.service.js';
import { OrdersService } from './orders.service.js';

/** Body fleksibel: objek OrderItem/payload dari frontend (field baru otomatis tersimpan) */
const FLEXIBLE_BODY = {
  schema: { type: 'object', additionalProperties: true },
} as const;

@ApiTags('Orders (Sales)')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Semua role yang login boleh membaca (dipakai Dashboard & halaman Jobs) */
  @Get()
  findAll() {
    return this.orders.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  @Roles('sales', 'sales_ops')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Sales order berhasil dibuat')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    return this.orders.create(body, user);
  }

  @Put(':id')
  @Roles('sales', 'sales_ops')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Sales order berhasil diperbarui')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.update(id, body, user);
  }

  @Delete(':id')
  @Roles('sales', 'sales_ops')
  @ResponseMessage('Draft order berhasil dihapus')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.remove(id, user);
  }

  @Post(':id/send-to-ops')
  @HttpCode(200)
  @Roles('sales', 'sales_ops')
  @ResponseMessage('Order dikirim ke tim Operasional')
  sendToOps(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.orders.sendToOperational(id, user);
  }
}

@ApiTags('Operational')
@ApiBearerAuth()
@Roles('operasional', 'sales_ops')
@Controller('operational/orders')
export class OperationalController {
  constructor(private readonly operational: OperationalService) {}

  @Get()
  findAll() {
    return this.operational.findAll();
  }

  @Put(':id')
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Data operasional berhasil disimpan')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operational.update(id, body, user);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ResponseMessage('Operasional selesai, order siap ditagihkan')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteOperationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.operational.complete(id, dto, user);
  }
}

@ApiTags('Billing')
@ApiBearerAuth()
@Roles('finance')
@Controller('billing/orders')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  findAll() {
    return this.billing.findAll();
  }

  @Post(':id/invoice')
  @HttpCode(200)
  @ApiBody(FLEXIBLE_BODY)
  @ResponseMessage('Invoice berhasil diterbitkan')
  processInvoice(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.processInvoice(id, body, user);
  }

  @Patch(':id/received')
  @ResponseMessage('Invoice dikonfirmasi diterima customer')
  markAsReceived(
    @Param('id') id: string,
    @Body() dto: MarkReceivedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.markAsReceived(id, dto, user);
  }

  @Post(':id/payment')
  @HttpCode(200)
  @ResponseMessage('Pembayaran dikonfirmasi lunas')
  confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billing.confirmPayment(id, dto, user);
  }
}
