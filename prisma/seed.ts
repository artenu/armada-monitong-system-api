/**
 * Seed data awal (aman dijalankan berulang / idempoten).
 *   npx prisma db seed
 *
 * - Master data, tarif kontrak & tarif PNBP dari seed-data.json
 *   (disesuaikan dengan Excel "Monrep RKBM PPJK PBM 2026").
 *   Default: data yang sudah ada TIDAK ditimpa, supaya perubahan dari aplikasi tetap aman.
 *   `npm run db:seed:sync -- --confirm <nama-database>`: data dengan ID yang sama DIPERBARUI
 *   mengikuti seed-data.json (tidak ada yang dihapus). DIKUNCI:
 *     - ditolak bila NODE_ENV=production (di server, master data dikelola lewat aplikasi),
 *     - wajib --confirm dengan nama database tujuan,
 *     - backup otomatis dibuat sebelum sync.
 * - Di kedua mode, baris yang pernah diubah/dihapus lewat aplikasi (tercatat di audit_logs)
 *   TIDAK PERNAH ditimpa atau dibuat ulang.
 * - Akun awal per role. Akun yang emailnya sudah ada TIDAK diubah (password tidak direset).
 *   Password diambil dari env SEED_PASSWORD_<ROLE> (mis. SEED_PASSWORD_SALES),
 *   atau dibuat acak lalu dicetak SEKALI di terminal.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import { spawnSync } from 'node:child_process';
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

/** Tolak seed-data.json yang punya ID ganda: dengan upsert, baris terakhir diam-diam menimpa yang pertama. */
function assertUniqueIds(data: SeedData) {
  const groups: Array<[string, Json[]]> = [
    ...Object.entries(data.masterData).map(
      ([resource, items]) =>
        [`masterData.${resource}`, items] as [string, Json[]],
    ),
    ['contractRates', data.contractRates],
    ['pnbpPortRates', data.pnbpPortRates],
  ];
  const problems: string[] = [];
  for (const [name, items] of groups) {
    const seen = new Map<string, string>();
    for (const item of items) {
      const id = text(item.id);
      if (!id) continue;
      const label =
        text(item.nama) || text(item.customerName) || text(item.portName);
      const first = seen.get(id);
      if (first !== undefined) {
        problems.push(`${name}: id "${id}" dipakai "${first}" dan "${label}"`);
      } else {
        seen.set(id, label);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `seed-data.json punya ID ganda (database tidak diubah):\n- ${problems.join('\n- ')}`,
    );
  }
}

/**
 * Baris yang pernah diubah, dibuat, atau dihapus lewat aplikasi (audit_logs).
 * Kunci: "<entity>|<id>", mis. "master:customer|1", "contract_rate|RATE-CEP-001".
 */
async function loadAppEditedRows(): Promise<Set<string>> {
  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { action: { startsWith: 'master.' } },
        { action: { startsWith: 'contract_rate.' } },
        { action: { startsWith: 'pnbp_rate.' } },
      ],
    },
    select: { entity: true, entityId: true },
  });
  return new Set(rows.map((r) => `${r.entity}|${r.entityId ?? ''}`));
}

/** Kunci mode --sync: melempar error bila sync tidak diizinkan. */
function assertSyncAllowed(args: string[]): void {
  const dbName = decodeURIComponent(
    new URL(process.env.DATABASE_URL as string).pathname.slice(1),
  );
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'db:seed:sync DIKUNCI di production: master data dikelola lewat aplikasi. ' +
        'Gunakan "npm run db:seed" (hanya menambah data yang belum ada).',
    );
  }
  const idx = args.indexOf('--confirm');
  if (idx < 0 || args[idx + 1] !== dbName) {
    throw new Error(
      `db:seed:sync DIKUNCI. Sync menimpa master data & tarif di database "${dbName}" ` +
        'dengan isi seed-data.json.\n' +
        `Bila yakin: npm run db:seed:sync -- --confirm ${dbName}\n` +
        'Baris yang pernah diubah lewat aplikasi tetap tidak akan ditimpa, dan backup dibuat otomatis.',
    );
  }
}

function backupBeforeSync(): void {
  console.log('Membuat backup sebelum sync...');
  const res = spawnSync(
    process.execPath,
    [
      join(import.meta.dirname, '..', 'scripts', 'backup-db.mjs'),
      '--label=pre-sync',
    ],
    { stdio: 'inherit' },
  );
  if (res.status !== 0) {
    throw new Error('Backup gagal, sync dibatalkan (database tidak diubah).');
  }
}

async function seedMaster(data: SeedData, sync: boolean) {
  const appEdited = await loadAppEditedRows();
  const skipped: string[] = [];
  const isAppEdited = (key: string) => {
    if (!appEdited.has(key)) return false;
    skipped.push(key);
    return true;
  };
  const count = { created: 0, updated: 0 };
  const track = (existed: boolean) => {
    if (!existed) count.created++;
    else if (sync) count.updated++;
  };

  for (const [resource, items] of Object.entries(data.masterData)) {
    for (const [position, item] of items.entries()) {
      const itemId = text(item.id, `${resource}-${position + 1}`);
      if (isAppEdited(`master:${resource}|${itemId}`)) continue;
      const where = { resource_itemId: { resource, itemId } };
      const existed = Boolean(await prisma.masterItem.findUnique({ where }));
      if (existed && !sync) continue;
      const fields = {
        kode: text(item.kode, itemId),
        nama: text(item.nama, itemId),
        status: status(item.status),
        position,
        data: item as Prisma.InputJsonValue,
      };
      await prisma.masterItem.upsert({
        where,
        create: { resource, itemId, ...fields },
        update: fields,
      });
      track(existed);
    }
  }

  for (const [position, rate] of data.contractRates.entries()) {
    const rateId = text(
      rate.id,
      `RATE-${String(position + 1).padStart(3, '0')}`,
    );
    if (isAppEdited(`contract_rate|${rateId}`)) continue;
    const existed = Boolean(
      await prisma.contractRate.findUnique({ where: { rateId } }),
    );
    if (existed && !sync) continue;
    const fields = {
      customerName: text(rate.customerName, '-'),
      service: text(rate.service) || null,
      location: text(rate.location) || null,
      status: status(rate.status),
      position,
      data: { ...rate, id: rateId } as Prisma.InputJsonValue,
    };
    await prisma.contractRate.upsert({
      where: { rateId },
      create: { rateId, ...fields },
      update: fields,
    });
    track(existed);
  }

  for (const [position, rate] of data.pnbpPortRates.entries()) {
    const rateId = text(
      rate.id,
      `PNBP-${String(position + 1).padStart(3, '0')}`,
    );
    if (isAppEdited(`pnbp_rate|${rateId}`)) continue;
    const existed = Boolean(
      await prisma.pnbpPortRate.findUnique({ where: { rateId } }),
    );
    if (existed && !sync) continue;
    const fields = {
      portName: text(rate.portName, '-'),
      status: status(rate.status),
      position,
      data: { ...rate, id: rateId } as Prisma.InputJsonValue,
    };
    await prisma.pnbpPortRate.upsert({
      where: { rateId },
      create: { rateId, ...fields },
      update: fields,
    });
    track(existed);
  }
  console.log(
    `Master data: ${count.created} baris baru` +
      (sync ? `, ${count.updated} baris diperbarui (mode --sync).` : '.'),
  );
  if (skipped.length > 0) {
    console.log(
      `${skipped.length} baris dilewati karena pernah diubah/dihapus lewat aplikasi: ${skipped.join(', ')}`,
    );
  }
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
  assertUniqueIds(data);
  const args = process.argv.slice(2);
  const sync = args.includes('--sync');
  if (sync) {
    assertSyncAllowed(args);
    backupBeforeSync();
  }
  await seedMaster(data, sync);
  await seedAccounts();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
