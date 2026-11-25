import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { validateFlexible } from '../common/validation.js';
import {
  Prisma,
  type ActiveStatus,
  type ContractRate,
  type MasterItem,
  type PnbpPortRate,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ContractRateCoreDto,
  MasterItemCoreDto,
  PnbpRateCoreDto,
} from './dto/master.dto.js';
import {
  isMasterResource,
  MASTER_RESOURCES,
  type MasterResource,
} from './master.constants.js';

type Json = Record<string, unknown>;

const asStatus = (value: unknown): ActiveStatus =>
  value === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
const optionalString = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** Nomor berikutnya dari ID berpola PREFIX-NNN (mis. RATE-007 -> RATE-008) */
const nextCode = (existing: string[], prefix: string) => {
  const max = existing.reduce((acc, code) => {
    const n = Number(code.slice(prefix.length));
    return code.startsWith(prefix) && Number.isInteger(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

@Injectable()
export class MasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Master item generik (customer, tug-boat, barge, vessel, lokasi, pol, pod, agen, drop-point)
  // ---------------------------------------------------------------------------

  private toItem(item: MasterItem) {
    return {
      ...(item.data as Json),
      id: item.itemId,
      kode: item.kode,
      nama: item.nama,
      status: item.status,
    };
  }

  assertResource(resource: string): MasterResource {
    if (!isMasterResource(resource)) {
      throw new NotFoundException(
        `Master data "${resource}" tidak dikenal. Pilihan: ${Object.keys(MASTER_RESOURCES).join(', ')}.`,
      );
    }
    return resource;
  }

  /** Semua master sekaligus (untuk cache dropdown frontend setelah login) */
  async findAllResources() {
    const items = await this.prisma.masterItem.findMany({
      orderBy: [{ resource: 'asc' }, { position: 'asc' }],
    });
    const result = Object.fromEntries(
      Object.keys(MASTER_RESOURCES).map((key) => [key, [] as Json[]]),
    ) as Record<string, Json[]>;
    for (const item of items) {
      (result[item.resource] ??= []).push(this.toItem(item));
    }
    return result;
  }

  async findItems(resource: string) {
    const items = await this.prisma.masterItem.findMany({
      where: { resource: this.assertResource(resource) },
      orderBy: { position: 'asc' },
    });
    return items.map((i) => this.toItem(i));
  }

  async saveItem(resource: string, body: unknown, user: AuthUser) {
    const res = this.assertResource(resource);
    const payload = await validateFlexible(MasterItemCoreDto, body);
    const itemId = optionalString(payload.id) ?? randomUUID();
    const existing = await this.prisma.masterItem.findUnique({
      where: { resource_itemId: { resource: res, itemId } },
    });

    let kode = optionalString(payload.kode) ?? existing?.kode;
    if (!kode) {
      const codes = await this.prisma.masterItem.findMany({
        where: { resource: res },
        select: { kode: true },
      });
      kode = nextCode(
        codes.map((c) => c.kode),
        `${MASTER_RESOURCES[res]}-`,
      );
    }
    const nama = String(payload.nama).trim();
    const fields = {
      kode,
      nama,
      status: asStatus(payload.status ?? existing?.status),
      data: {
        ...(existing?.data as Json | undefined),
        ...payload,
        id: itemId,
        kode,
        nama,
      } as Prisma.InputJsonValue,
    };

    const saved = existing
      ? await this.prisma.masterItem.update({
          where: { id: existing.id },
          data: fields,
        })
      : await this.prisma.masterItem.create({
          data: {
            resource: res,
            itemId,
            position: await this.nextPosition('masterItem', { resource: res }),
            ...fields,
          },
        });
    await this.audit.record(
      user,
      existing ? 'master.update' : 'master.create',
      `master:${res}`,
      itemId,
    );
    return this.toItem(saved);
  }

  async deleteItem(resource: string, id: string, user: AuthUser) {
    const res = this.assertResource(resource);
    const deleted = await this.prisma.masterItem.deleteMany({
      where: { resource: res, itemId: id },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(
        `Data master ${res} dengan ID ${id} tidak ditemukan.`,
      );
    }
    await this.audit.record(user, 'master.delete', `master:${res}`, id);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Tarif kontrak customer
  // ---------------------------------------------------------------------------

  private toContractRate(rate: ContractRate) {
    return {
      ...(rate.data as Json),
      id: rate.rateId,
      customerName: rate.customerName,
      service: rate.service ?? undefined,
      location: rate.location ?? undefined,
      status: rate.status,
    };
  }

  async findContractRates() {
    const rates = await this.prisma.contractRate.findMany({
      orderBy: { position: 'asc' },
    });
    return rates.map((r) => this.toContractRate(r));
  }

  async saveContractRate(body: unknown, user: AuthUser) {
    const payload = await validateFlexible(ContractRateCoreDto, body);
    let rateId = optionalString(payload.id);
    if (!rateId) {
      const ids = await this.prisma.contractRate.findMany({
        select: { rateId: true },
      });
      rateId = nextCode(
        ids.map((r) => r.rateId),
        'RATE-',
      );
    }
    const existing = await this.prisma.contractRate.findUnique({
      where: { rateId },
    });
    const fields = {
      customerName: String(payload.customerName).trim(),
      service: optionalString(payload.service),
      location: optionalString(payload.location),
      status: asStatus(payload.status ?? existing?.status),
      data: {
        ...(existing?.data as Json | undefined),
        ...payload,
        id: rateId,
      } as Prisma.InputJsonValue,
    };
    const saved = existing
      ? await this.prisma.contractRate.update({
          where: { id: existing.id },
          data: fields,
        })
      : await this.prisma.contractRate.create({
          data: {
            rateId,
            position: await this.nextPosition('contractRate'),
            ...fields,
          },
        });
    await this.audit.record(
      user,
      existing ? 'contract_rate.update' : 'contract_rate.create',
      'contract_rate',
      rateId,
    );
    return this.toContractRate(saved);
  }

  async deleteContractRate(id: string, user: AuthUser) {
    const deleted = await this.prisma.contractRate.deleteMany({
      where: { rateId: id },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(`Tarif kontrak ${id} tidak ditemukan.`);
    }
    await this.audit.record(user, 'contract_rate.delete', 'contract_rate', id);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Tarif PNBP per pelabuhan
  // ---------------------------------------------------------------------------

  private toPnbpRate(rate: PnbpPortRate) {
    return {
      ...(rate.data as Json),
      id: rate.rateId,
      portName: rate.portName,
      status: rate.status,
    };
  }

  async findPnbpRates() {
    const rates = await this.prisma.pnbpPortRate.findMany({
      orderBy: { position: 'asc' },
    });
    return rates.map((r) => this.toPnbpRate(r));
  }

  async savePnbpRate(body: unknown, user: AuthUser) {
    const payload = await validateFlexible(PnbpRateCoreDto, body);
    let rateId = optionalString(payload.id);
    if (!rateId) {
      const ids = await this.prisma.pnbpPortRate.findMany({
        select: { rateId: true },
      });
      rateId = nextCode(
        ids.map((r) => r.rateId),
        'PNBP-',
      );
    }
    const existing = await this.prisma.pnbpPortRate.findUnique({
      where: { rateId },
    });
    const fields = {
      portName: String(payload.portName).trim(),
      status: asStatus(payload.status ?? existing?.status),
      data: {
        ...(existing?.data as Json | undefined),
        ...payload,
        id: rateId,
      } as Prisma.InputJsonValue,
    };
    const saved = existing
      ? await this.prisma.pnbpPortRate.update({
          where: { id: existing.id },
          data: fields,
        })
      : await this.prisma.pnbpPortRate.create({
          data: {
            rateId,
            position: await this.nextPosition('pnbpPortRate'),
            ...fields,
          },
        });
    await this.audit.record(
      user,
      existing ? 'pnbp_rate.update' : 'pnbp_rate.create',
      'pnbp_rate',
      rateId,
    );
    return this.toPnbpRate(saved);
  }

  async deletePnbpRate(id: string, user: AuthUser) {
    const deleted = await this.prisma.pnbpPortRate.deleteMany({
      where: { rateId: id },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(`Tarif PNBP ${id} tidak ditemukan.`);
    }
    await this.audit.record(user, 'pnbp_rate.delete', 'pnbp_rate', id);
    return null;
  }

  /** Posisi urutan berikutnya (data baru tampil di akhir, seperti di frontend) */
  private async nextPosition(
    model: 'masterItem' | 'contractRate' | 'pnbpPortRate',
    where: { resource?: string } = {},
  ): Promise<number> {
    const agg =
      model === 'masterItem'
        ? await this.prisma.masterItem.aggregate({
            where,
            _max: { position: true },
          })
        : model === 'contractRate'
          ? await this.prisma.contractRate.aggregate({
              _max: { position: true },
            })
          : await this.prisma.pnbpPortRate.aggregate({
              _max: { position: true },
            });
    return (agg._max.position ?? -1) + 1;
  }
}
