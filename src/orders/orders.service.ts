import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { omitKeys, validateFlexible } from '../common/validation.js';
import { OrderCoreDto } from './dto/order.dto.js';
import { DRAFT_STATUS, PROTECTED_ORDER_KEYS } from './order-workflow.js';
import { OrdersRepository } from './orders.repository.js';

/** Order tahap Sales: buat, ubah draft, hapus draft, kirim ke Operasional */
@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.orders.list();
  }

  async findOne(orderNo: string) {
    return this.orders.toResponse(await this.orders.getOrThrow(orderNo));
  }

  async create(body: unknown, user: AuthUser) {
    const fields = omitKeys(
      await validateFlexible(OrderCoreDto, body),
      PROTECTED_ORDER_KEYS,
    );
    const order = await this.orders.create(fields, user.id);
    await this.audit.record(user, 'order.create', 'order', order.orderNo, {
      customer: order.customer,
      service: order.service,
    });
    return this.orders.toResponse(order);
  }

  async update(orderNo: string, body: unknown, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertDraft(order.status, orderNo, 'diubah');
    const changes = omitKeys(
      await validateFlexible(OrderCoreDto, body, { skipMissing: true }),
      PROTECTED_ORDER_KEYS,
    );
    const updated = await this.orders.update(order, changes);
    await this.audit.record(user, 'order.update', 'order', orderNo);
    return this.orders.toResponse(updated);
  }

  async remove(orderNo: string, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertDraft(order.status, orderNo, 'dihapus');
    await this.orders.softDelete(order);
    await this.audit.record(user, 'order.delete', 'order', orderNo);
    return null;
  }

  async sendToOperational(orderNo: string, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertDraft(order.status, orderNo, 'dikirim ke Operasional');
    const updated = await this.orders.update(order, {}, 'Operational');
    await this.audit.record(user, 'order.send_to_ops', 'order', orderNo, {
      from: order.status,
      to: updated.status,
    });
    return this.orders.toResponse(updated);
  }

  private assertDraft(status: string, orderNo: string, action: string) {
    if (status !== DRAFT_STATUS) {
      throw new ConflictException(
        `Order ${orderNo} berstatus "${status}" sehingga tidak dapat ${action}. Hanya order "${DRAFT_STATUS}" yang bisa ${action}.`,
      );
    }
  }
}
