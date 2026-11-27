import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { omitKeys, validateFlexible } from '../common/validation.js';
import type { CompleteOperationDto } from './dto/order.dto.js';
import { OperationalCoreDto } from './dto/order.dto.js';
import {
  DRAFT_STATUS,
  mergePositionHistory,
  PROTECTED_ORDER_KEYS,
  resolveCompleteStatus,
  resolveOperationalStatus,
} from './order-workflow.js';
import { OrdersRepository } from './orders.repository.js';

/** Order tahap Operasional: update lapangan, dokumen trigger finance, selesai muat/bongkar */
@Injectable()
export class OperationalService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.orders.list({ status: { not: DRAFT_STATUS } });
  }

  async update(orderNo: string, body: unknown, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertSentToOps(order.status, orderNo);
    const payload = await validateFlexible(OperationalCoreDto, body, {
      skipMissing: true,
    });
    const status = resolveOperationalStatus(order.status, payload.status);
    // Log lokasi disusun server dari data tersimpan; kiriman browser diabaikan
    const { positionHistory: _fromClient, ...changes } = omitKeys(
      payload,
      PROTECTED_ORDER_KEYS,
    );
    const positionHistory = mergePositionHistory(
      (order.data ?? {}) as Record<string, unknown>,
      changes,
      user.name,
    );
    const updated = await this.orders.update(
      order,
      positionHistory ? { ...changes, positionHistory } : changes,
      status,
    );
    await this.audit.record(
      user,
      'order.operational_update',
      'order',
      orderNo,
      {
        from: order.status,
        to: updated.status,
      },
    );
    return this.orders.toResponse(updated);
  }

  async complete(orderNo: string, dto: CompleteOperationDto, user: AuthUser) {
    const order = await this.orders.getOrThrow(orderNo);
    this.assertSentToOps(order.status, orderNo);
    const updated = await this.orders.update(
      order,
      {
        vesselCompleteDate: dto.completeDate,
        ...(dto.isBongkar
          ? { dischargeEndDate: dto.completeDate }
          : { loadingEndDate: dto.completeDate }),
        finalDsr: dto.finalDsr,
      },
      resolveCompleteStatus(order.status),
    );
    await this.audit.record(user, 'order.complete', 'order', orderNo, {
      from: order.status,
      to: updated.status,
      finalDsr: dto.finalDsr,
    });
    return this.orders.toResponse(updated);
  }

  private assertSentToOps(status: string, orderNo: string) {
    if (status === DRAFT_STATUS) {
      throw new ConflictException(
        `Order ${orderNo} masih "${DRAFT_STATUS}" dan belum dikirim ke tim Operasional.`,
      );
    }
  }
}
