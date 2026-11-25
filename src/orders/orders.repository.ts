import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDateOnly, toBusinessDate } from '../common/dates.js';
import { Prisma, type Order } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DRAFT_STATUS, nextOrderNo } from './order-workflow.js';

/** OrderItem seperti yang diharapkan frontend: data JSON + id (nomor job) + status */
export type OrderItemResponse = Record<string, unknown> & {
  id: string;
  status: string;
};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

@Injectable()
export class OrdersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  toResponse(order: Order): OrderItemResponse {
    const data = (order.data ?? {}) as Record<string, unknown>;
    return { ...data, id: order.orderNo, status: order.status };
  }

  async list(where: Prisma.OrderWhereInput = {}) {
    const orders = await this.prisma.order.findMany({
      where: { ...where, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { orderNo: 'desc' }],
    });
    return orders.map((o) => this.toResponse(o));
  }

  async getOrThrow(orderNo: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { orderNo, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException(`Order ${orderNo} tidak ditemukan.`);
    }
    return order;
  }

  /** Buat order baru dengan nomor JOB-<tahun>-NNN dari server (aman untuk banyak user sekaligus) */
  async create(
    fields: Record<string, unknown>,
    createdById: string,
  ): Promise<Order> {
    const year = toBusinessDate(
      new Date(),
      this.config.getOrThrow('APP_TIMEZONE'),
    ).slice(0, 4);
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.order.findMany({
        where: { orderNo: { startsWith: `JOB-${year}-` } },
        select: { orderNo: true },
      });
      const orderNo = nextOrderNo(
        existing.map((o) => o.orderNo),
        year,
      );
      try {
        return await this.prisma.order.create({
          data: {
            orderNo,
            status: DRAFT_STATUS,
            createdById,
            ...this.columnsFrom(fields),
            data: fields as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        // Nomor sudah diambil request lain di saat yang sama: coba nomor berikutnya
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    throw new ConflictException(
      'Gagal membuat nomor order. Silakan coba lagi.',
    );
  }

  /**
   * Gabungkan perubahan ke data order. Memakai pengecekan `updatedAt`
   * agar dua pengguna yang menyimpan bersamaan tidak saling menimpa diam-diam.
   */
  async update(
    order: Order,
    changes: Record<string, unknown>,
    status?: string,
  ): Promise<Order> {
    const data = {
      ...((order.data ?? {}) as Record<string, unknown>),
      ...changes,
    };
    const result = await this.prisma.order.updateMany({
      where: { id: order.id, updatedAt: order.updatedAt },
      data: {
        status: status ?? order.status,
        updatedAt: new Date(),
        ...this.columnsFrom(data),
        data: data as Prisma.InputJsonValue,
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        `Order ${order.orderNo} baru saja diubah pengguna lain. Muat ulang data lalu coba lagi.`,
      );
    }
    return this.getOrThrow(order.orderNo);
  }

  async softDelete(order: Order) {
    await this.prisma.order.update({
      where: { id: order.id },
      data: { deletedAt: new Date() },
    });
  }

  /** Salin field inti dari data JSON ke kolom (untuk filter & laporan) */
  private columnsFrom(data: Record<string, unknown>) {
    return {
      customer: str(data.customer) ?? '-',
      service: str(data.service) ?? '-',
      vessel: str(data.vessel),
      startDate: parseDateOnly(data.startDate),
    };
  }
}
