// Fungsi bersama untuk backup & restore database (dipakai backup-db.mjs dan restore-db.mjs).
//
// Backup = 2 bagian:
// 1. Database: pg_dump format custom -> <BACKUP_DIR>/armada_<db>_<waktu>[_<label>].dump
//    + manifest .json berisi jumlah baris per tabel (untuk uji restore)
// 2. Berkas unggahan: cermin <BACKUP_DIR>/uploads/ (hanya menyalin berkas baru;
//    nama berkas UUID tidak pernah berubah, berkas yang dihapus di aplikasi tetap tersimpan)
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import pg from 'pg';

export const ROOT = resolve(import.meta.dirname, '..', '..');
const DUMP_PREFIX = 'armada_';
const MIN_KEEP = 7; // jumlah backup terbaru yang selalu disimpan, berapa pun umurnya

export function config() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL belum diisi di .env');
  }
  const url = new URL(process.env.DATABASE_URL);
  return {
    url,
    dbName: decodeURIComponent(url.pathname.slice(1)),
    backupDir: resolve(ROOT, process.env.BACKUP_DIR || 'backups'),
    uploadDir: resolve(ROOT, process.env.UPLOAD_DIR || 'uploads'),
    retentionDays: Number(process.env.BACKUP_RETENTION_DAYS || 30),
  };
}

/** URL koneksi untuk database lain di server yang sama (tanpa parameter Prisma seperti ?schema=) */
export function urlFor(dbName) {
  const { url } = config();
  const next = new URL(url);
  next.pathname = `/${encodeURIComponent(dbName)}`;
  next.search = '';
  return next;
}

/** Argumen & env untuk pg_dump / pg_restore: password lewat PGPASSWORD, bukan di baris perintah */
function libpq(dbName) {
  const u = urlFor(dbName);
  return {
    args: [
      `--host=${u.hostname}`,
      `--port=${u.port || '5432'}`,
      `--username=${decodeURIComponent(u.username)}`,
      `--dbname=${dbName}`,
    ],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) },
  };
}

/** Cari pg_dump/pg_restore: PG_BIN_DIR -> PATH -> C:\Program Files\PostgreSQL\<terbaru>\bin */
export function pgBin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const dirs = [];
  if (process.env.PG_BIN_DIR) dirs.push(process.env.PG_BIN_DIR);
  dirs.push(...(process.env.PATH ?? '').split(delimiter));
  if (process.platform === 'win32') {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      for (const v of readdirSync(base).sort((a, b) => Number(b) - Number(a))) {
        dirs.push(join(base, v, 'bin'));
      }
    }
  }
  for (const dir of dirs) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe);
  }
  throw new Error(
    `${name} tidak ditemukan. Pasang PostgreSQL client 18, atau isi PG_BIN_DIR di .env (folder berisi ${exe}).`,
  );
}

function run(bin, args, env) {
  const res = spawnSync(bin, args, { env, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      `${bin} gagal (exit ${res.status}): ${res.stderr || res.error?.message || ''}`.trim(),
    );
  }
  return res.stdout;
}

/** Jumlah baris setiap tabel di database (urut nama tabel) */
export async function tableCounts(dbName) {
  const client = new pg.Client({ connectionString: urlFor(dbName).toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const counts = {};
    for (const { tablename } of rows) {
      const r = await client.query(
        `SELECT count(*)::int AS n FROM "${tablename}"`,
      );
      counts[tablename] = r.rows[0].n;
    }
    return counts;
  } finally {
    await client.end();
  }
}

/** Perintah tingkat server (CREATE/DROP DATABASE) lewat template1 */
export async function serverQuery(sql) {
  const client = new pg.Client({
    connectionString: urlFor('template1').toString(),
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Cermin berkas unggahan: salin berkas yang belum ada di backup */
function mirrorUploads(uploadDir, target) {
  if (!existsSync(uploadDir)) return { copied: 0, total: 0 };
  mkdirSync(target, { recursive: true });
  let copied = 0;
  let total = 0;
  for (const name of readdirSync(uploadDir)) {
    const src = join(uploadDir, name);
    if (!statSync(src).isFile()) continue;
    total++;
    const dst = join(target, name);
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) {
      copyFileSync(src, dst);
      copied++;
    }
  }
  return { copied, total };
}

/** Hapus backup lebih tua dari retensi, tapi selalu sisakan MIN_KEEP yang terbaru */
function rotate(backupDir, retentionDays) {
  const dumps = listDumps(backupDir);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const file of dumps.slice(MIN_KEEP)) {
    if (statSync(file).mtimeMs < cutoff) {
      unlinkSync(file);
      const manifest = file.replace(/\.dump$/, '.json');
      if (existsSync(manifest)) unlinkSync(manifest);
      removed++;
    }
  }
  return removed;
}

/** Daftar file .dump, terbaru dulu */
export function listDumps(backupDir = config().backupDir) {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((f) => f.startsWith(DUMP_PREFIX) && f.endsWith('.dump'))
    .map((f) => join(backupDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

export function readManifest(dumpFile) {
  const file = dumpFile.replace(/\.dump$/, '.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/** Buat backup database + cermin uploads. Mengembalikan ringkasan. */
export async function createBackup({ label } = {}) {
  const { dbName, backupDir, uploadDir, retentionDays } = config();
  mkdirSync(backupDir, { recursive: true });
  const base = `${DUMP_PREFIX}${dbName}_${stamp()}${label ? `_${label}` : ''}`;
  const dumpFile = join(backupDir, `${base}.dump`);

  const counts = await tableCounts(dbName);
  const { args, env } = libpq(dbName);
  run(
    pgBin('pg_dump'),
    [
      ...args,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${dumpFile}`,
    ],
    env,
  );
  // Pastikan file dump utuh & bisa dibaca pg_restore
  run(pgBin('pg_restore'), ['--list', dumpFile], env);

  const uploads = mirrorUploads(uploadDir, join(backupDir, 'uploads'));
  writeFileSync(
    dumpFile.replace(/\.dump$/, '.json'),
    JSON.stringify(
      {
        database: dbName,
        createdAt: new Date().toISOString(),
        label: label ?? null,
        tables: counts,
        uploadsTotal: uploads.total,
      },
      null,
      2,
    ),
  );
  const removed = rotate(backupDir, retentionDays);
  return {
    dumpFile,
    sizeKb: Math.round(statSync(dumpFile).size / 1024),
    counts,
    uploads,
    removed,
  };
}

/** Pulihkan file dump ke database `dbName` (DROP + CREATE). Hati-hati: isi lama hilang. */
export async function restoreInto(dumpFile, dbName) {
  await serverQuery(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await serverQuery(`CREATE DATABASE "${dbName}"`);
  const { args, env } = libpq(dbName);
  run(
    pgBin('pg_restore'),
    [...args, '--no-owner', '--no-privileges', '--exit-on-error', dumpFile],
    env,
  );
}
