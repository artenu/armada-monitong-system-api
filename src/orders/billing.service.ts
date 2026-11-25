import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { toBusinessDate } from '../common/dates.js';
import { omitKeys, validateFlexible } from '../common/validation.js';
import type { ConfirmPaymentDto, MarkReceivedDto } from './dto/order.dto.js';
import { InvoiceCoreDto } from './dto/order.dto.js';
import {
  BILLING_LIST_STATUSES,
  INVOICE_FROM,
  PAYMENT_FROM,
  PROTECTED_ORDER_KEYS,
  RECEIVE_FROM,
} from './order-workflow.js';
import { OrdersRepository } from './orders.repository.js';

/** Order tahap Finance: terbitkan invoice, konfirmasi diterima, konfirmasi lunas */
@Injectable()
export class BillingService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private today() {
    return toBusinessDate(new Date(), this.config.getOrThrow('APP_TIMEZONE'));
  }

  findAll() {
    return this.orders.list({ status: { in: [...BILLING_LIST_STATUSES] } });
  }

  async processInvoice(orderNo: string, body: unknown, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertStatus(
      order.status,
      INVOICE_FROM,
      orderNo,
      'diterbitkan invoice-nya',
    );
    const payload = omitKeys(
      await validateFlexible(InvoiceCoreDto, body),
      PROTECTED_ORDER_KEYS,
    );
    const updated = await this.orders.update(
      order,
      { ...payload, sentDate: this.today() },
      'Terkirim',
    );
    await this.audit.record(user, 'billing.invoice', 'order', orderNo, {
      invoiceNo: payload.invoiceNo,
      totalInvoice: payload.totalInvoice,
    });
    return this.orders.toResponse(updated);
  }

  async markAsReceived(orderNo: string, dto: MarkReceivedDto, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertStatus(
      order.status,
      RECEIVE_FROM,
      orderNo,
      'dikonfirmasi diterima',
    );
    const updated = await this.orders.update(
      order,
      { receivedDate: dto.receivedDate ?? this.today() },
      'Diterima',
    );
    await this.audit.record(user, 'billing.received', 'order', orderNo);
    return this.orders.toResponse(updated);
  }

  async confirmPayment(
    orderNo: string,
    dto: ConfirmPaymentDto,
    user: AuthUser,
  ) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertStatus(
      order.status,
      PAYMENT_FROM,
      orderNo,
      'dikonfirmasi lunas',
    );
    const updated = await this.orders.update(
      order,
      { paymentDate: dto.paymentDate, paymentNotes: dto.paymentNotes ?? '' },
      'Lunas',
    );
    await this.audit.record(user, 'billing.payment', 'order', orderNo, {
      paymentDate: dto.paymentDate,
    });
    return this.orders.toResponse(updated);
  }

  private assertStatus(
    status: string,
    allowed: readonly string[],
    orderNo: string,
    action: string,
  ) {
    if (!allowed.includes(status)) {
      throw new ConflictException(
        `Order ${orderNo} berstatus "${status}" sehingga tidak dapat ${action}. Status yang diizinkan: ${allowed.join(', ')}.`,
      );
    }
  }
}
