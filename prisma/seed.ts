/**
 * Seed data awal (aman dijalankan berulang / idempoten).
 *   npx prisma db seed
 *
 * - Master data, tarif kontrak & tarif PNBP dari seed-data.json (diekspor dari frontend).
 *   Data yang sudah ada TIDAK ditimpa, supaya perubahan dari aplikasi tetap aman.
 * - Akun awal per role. Akun yang emailnya sudah ada TIDAK diubah (password tidak direset).
 *   Password diambil dari env SEED_PASSWORD_<ROLE> (mis. SEED_PASSWORD_SALES),
 *   atau dibuat acak lalu dicetak SEKALI di terminal.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PrismaClient,
  type Prisma,
  type UserRole,
} from '../src/generated/prisma/client.js';

type Json = Record<string, unknown>;

interface SeedData {
  masterData: Record<string, Json[]>;
  contractRates: Json[];
  pnbpPortRates: Json[];
}

const SEED_ACCOUNTS: Array<{
  role: UserRole;
  name: string;
  email: string;
  department: string;
}> = [
  {
    role: 'admin',
    name: 'Administrator Sistem',
    email: 'admin@armada.local',
    department: 'Divisi IT & Manajemen Sistem',
  },
  {
    role: 'sales',
    name: 'Staf Sales',
    email: 'sales@armada.local',
    department: 'Divisi Komersial & Sales',
  },
  {
    role: 'operasional',
    name: 'Staf Operasional',
    email: 'ops@armada.local',
    department: 'Divisi Operasional Lapangan',
  },
  {
    role: 'sales_ops',
    name: 'Staf Sales & Operasional',
    email: 'salesops@armada.local',
    department: 'Divisi Sales & Operasional Lapangan',
  },
  {
    role: 'finance',
    name: 'Staf Accounting',
    email: 'accounting@armada.local',
    department: 'Divisi Keuangan & Billing',
  },
  {
    role: 'direktur',
    name: 'Direktur',
    email: 'direktur@armada.local',
    department: 'Direksi',
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

const status = (value: unknown) =>
  (value === 'Nonaktif' ? 'Nonaktif' : 'Aktif') as 'Aktif' | 'Nonaktif';
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const generatePassword = () =>
  randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').slice(0, 14);

async function seedMaster(data: SeedData) {
  let created = 0;
  for (const [resource, items] of Object.entries(data.masterData)) {
    for (const [position, item] of items.entries()) {
      const itemId = text(item.id, `${resource}-${position + 1}`);
      const exists = await prisma.masterItem.findUnique({
        where: { resource_itemId: { resource, itemId } },
      });
      if (exists) {
        continue;
      }
      await prisma.masterItem.create({
        data: {
          resource,
          itemId,
          kode: text(item.kode, itemId),
          nama: text(item.nama, itemId),
          status: status(item.status),
          position,
          data: item as Prisma.InputJsonValue,
        },
      });
      created++;
    }
  }

  for (const [position, rate] of data.contractRates.entries()) {
    const rateId = text(
      rate.id,
      `RATE-${String(position + 1).padStart(3, '0')}`,
    );
    if (await prisma.contractRate.findUnique({ where: { rateId } })) {
      continue;
    }
    await prisma.contractRate.create({
      data: {
        rateId,
        customerName: text(rate.customerName, '-'),
        service: text(rate.service) || null,
        location: text(rate.location) || null,
        status: status(rate.status),
        position,
        data: { ...rate, id: rateId } as Prisma.InputJsonValue,
      },
    });
    created++;
  }

  for (const [position, rate] of data.pnbpPortRates.entries()) {
    const rateId = text(
      rate.id,
      `PNBP-${String(position + 1).padStart(3, '0')}`,
    );
    if (await prisma.pnbpPortRate.findUnique({ where: { rateId } })) {
      continue;
    }
    await prisma.pnbpPortRate.create({
      data: {
        rateId,
        portName: text(rate.portName, '-'),
        status: status(rate.status),
        position,
        data: { ...rate, id: rateId } as Prisma.InputJsonValue,
      },
    });
    created++;
  }
  console.log(`Master data: ${created} baris baru ditambahkan.`);
}

async function seedAccounts() {
  const generated: Array<{ email: string; role: string; password: string }> =
    [];
  for (const account of SEED_ACCOUNTS) {
    if (await prisma.user.findUnique({ where: { email: account.email } })) {
      console.log(`Akun ${account.email} sudah ada, dilewati.`);
      continue;
    }
    const fromEnv = process.env[`SEED_PASSWORD_${account.role.toUpperCase()}`];
    const password =
      fromEnv && fromEnv.length >= 8 ? fromEnv : generatePassword();
    await prisma.user.create({
      data: {
        ...account,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    generated.push({
      email: account.email,
      role: account.role,
      password: fromEnv ? '(dari .env)' : password,
    });
  }

  if (generated.length > 0) {
    console.log(
      '\n=== AKUN BARU (catat sekarang, password tidak akan ditampilkan lagi) ===',
    );
    console.table(generated);
    console.log(
      'Segera ganti password lewat menu User Management setelah login.\n',
    );
  }
}

async function main() {
  const data = JSON.parse(
    readFileSync(join(import.meta.dirname, 'seed-data.json'), 'utf8'),
  ) as SeedData;
  await seedMaster(data);
  await seedAccounts();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
