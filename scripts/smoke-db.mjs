// Smoke test di DATABASE TERPISAH (armada_test), aman dijalankan kapan saja:
// data user di database development (armada_dev) tidak pernah disentuh.
//
//   npm run smoke
//
// Langkah:
// 1. Buat ulang database test (DROP + CREATE) di server PostgreSQL yang sama
// 2. Terapkan migrasi + seed (master data & akun uji dengan password tetap)
// 3. Jalankan server dari dist/ di port 8001 dengan folder upload terpisah
// 4. Jalankan scripts/smoke-test.mjs ke server itu, lalu matikan server
//
// Database test dibiarkan setelah selesai agar bisa diperiksa (pgAdmin / Prisma Studio);
// isinya dibuat ulang pada run berikutnya.
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const ROOT = join(import.meta.dirname, '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8001);
const UPLOAD_DIR = 'uploads-smoke';
const TEST_DB = process.env.SMOKE_DB_NAME ?? 'armada_test';

// Password akun uji: HANYA berlaku di database test
const PASSWORDS = {
  ADMIN: 'Smoke-Admin-2026',
  SALES: 'Smoke-Sales-2026',
  OPERASIONAL: 'Smoke-Ops-2026',
  SALES_OPS: 'Smoke-SalesOps-2026',
  FINANCE: 'Smoke-Finance-2026',
  DIREKTUR: 'Smoke-Direktur-2026',
};

const fail = (message) => {
  console.error(`\n[smoke] GAGAL: ${message}`);
  process.exit(1);
};

// --- Tentukan URL database test dari DATABASE_URL development
if (!process.env.DATABASE_URL) fail('DATABASE_URL belum diisi di .env');
const devUrl = new URL(process.env.DATABASE_URL);
const devDb = devUrl.pathname.slice(1);
if (!TEST_DB.endsWith('_test') || TEST_DB === devDb) {
  fail(`nama database test harus berakhiran "_test" dan bukan "${devDb}"`);
}
const testUrl = new URL(devUrl);
testUrl.pathname = `/${TEST_DB}`;
// Koneksi untuk CREATE/DROP DATABASE: lewat database development (hanya perintah
// tingkat server, tidak membaca/mengubah tabelnya). Database "postgres" tidak dipakai
// karena bisa saja sudah dihapus.
const adminUrl = devUrl;

if (!existsSync(join(ROOT, 'dist', 'main.js'))) {
  fail('dist/main.js belum ada. Jalankan "npm run build" dulu.');
}

const env = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  PORT: String(PORT),
  UPLOAD_DIR,
  NODE_ENV: 'development',
  COOKIE_SECURE: 'false',
  ...Object.fromEntries(
    Object.entries(PASSWORDS).map(([role, pw]) => [
      `SEED_PASSWORD_${role}`,
      pw,
    ]),
  ),
};

const run = (label, args) => {
  console.log(`[smoke] ${label}...`);
  const res = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr);
    fail(label);
  }
};

// 1. Buat ulang database test
console.log(`[smoke] membuat ulang database ${TEST_DB}...`);
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect().catch((err) => {
  fail(
    `tidak bisa terhubung ke PostgreSQL (${err.message}). Docker sudah jalan?`,
  );
});
await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${TEST_DB}"`);
await admin.end();

// 2. Migrasi + seed
const prismaCli = join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
run('migrasi', [prismaCli, 'migrate', 'deploy']);
run('seed', [
  join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  'prisma/seed.ts',
]);

// 3. Server khusus test
rmSync(join(ROOT, UPLOAD_DIR), { recursive: true, force: true });
console.log(`[smoke] menyalakan server test di port ${PORT}...`);
const server = spawn(process.execPath, ['dist/main.js'], { cwd: ROOT, env });
let serverLog = '';
let stopping = false;
server.stdout.on('data', (chunk) => (serverLog += chunk));
server.stderr.on('data', (chunk) => (serverLog += chunk));
server.on('exit', (code) => {
  if (code !== null && code !== 0 && !stopping) {
    console.error(serverLog);
    fail(`server test berhenti (exit ${code}). Port ${PORT} sudah dipakai?`);
  }
});
const stop = () => {
  stopping = true;
  server.kill();
  rmSync(join(ROOT, UPLOAD_DIR), { recursive: true, force: true });
};

const base = `http://127.0.0.1:${PORT}/api/v1`;
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await fetch(`${base}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!ready) await new Promise((done) => setTimeout(done, 500));
}
if (!ready) {
  stop();
  console.error(serverLog);
  fail('server test tidak menjawab /health');
}

// 4. Smoke test
const smoke = spawnSync(
  process.execPath,
  [
    'scripts/smoke-test.mjs',
    PASSWORDS.ADMIN,
    PASSWORDS.SALES,
    PASSWORDS.OPERASIONAL,
    PASSWORDS.SALES_OPS,
    PASSWORDS.FINANCE,
    PASSWORDS.DIREKTUR,
  ],
  {
    cwd: ROOT,
    env: { ...env, SMOKE_BASE_URL: base },
    stdio: 'inherit',
  },
);
stop();

const problems = serverLog
  .split('\n')
  .filter((line) => /\b(WARN|ERROR)\b/.test(line));
if (problems.length > 0) {
  console.log('\n[smoke] WARN/ERROR di log server test:');
  console.log(problems.join('\n'));
}
console.log(
  `\n[smoke] selesai. Database ${TEST_DB} dibiarkan untuk diperiksa; dibuat ulang pada run berikutnya.`,
);
process.exit(smoke.status === 0 && problems.length === 0 ? 0 : 1);
