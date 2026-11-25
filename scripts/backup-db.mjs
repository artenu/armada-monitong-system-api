// Backup database + berkas unggahan.
//
//   npm run db:backup             buat backup sekarang (dipakai juga oleh jadwal harian)
//   npm run db:backup:verify      uji restore backup terbaru ke database sementara
//                                 lalu bandingkan jumlah baris tiap tabel
//
// Pengaturan (.env): BACKUP_DIR (default: backups), BACKUP_RETENTION_DAYS (default: 30),
// PG_BIN_DIR (folder pg_dump bila tidak ada di PATH).
import 'dotenv/config';
import {
  config,
  createBackup,
  listDumps,
  readManifest,
  restoreInto,
  serverQuery,
  tableCounts,
} from './lib/db-backup.mjs';

const args = process.argv.slice(2);
const labelArg = args.find((a) => a.startsWith('--label='));
const label = labelArg
  ? labelArg.slice('--label='.length).replace(/[^\w-]/g, '')
  : undefined;
const time = () => new Date().toLocaleString('id-ID');

async function backup() {
  const result = await createBackup({ label });
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  console.log(
    `[${time()}] Backup berhasil: ${result.dumpFile} (${result.sizeKb} KB)`,
  );
  console.log(
    `  ${Object.entries(result.counts)
      .filter(([t]) => !t.startsWith('_'))
      .map(([t, n]) => `${t}=${n}`)
      .join(', ')} (total ${total} baris)`,
  );
  console.log(
    `  Berkas unggahan: ${result.uploads.copied} baru disalin, ${result.uploads.total} total`,
  );
  if (result.removed > 0) {
    console.log(
      `  ${result.removed} backup lama dihapus (retensi ${config().retentionDays} hari)`,
    );
  }
}

async function verify() {
  const { dbName } = config();
  const dumpFile = args.find((a) => a.endsWith('.dump')) ?? listDumps()[0];
  if (!dumpFile)
    throw new Error('Belum ada backup. Jalankan "npm run db:backup" dulu.');
  const manifest = readManifest(dumpFile);
  const checkDb = `${dbName}_restore_check`;
  console.log(
    `[${time()}] Uji restore ${dumpFile} -> database sementara ${checkDb}...`,
  );
  await restoreInto(dumpFile, checkDb);
  try {
    const restored = await tableCounts(checkDb);
    const expected = manifest?.tables ?? {};
    const rows = Object.keys({ ...expected, ...restored }).sort();
    let ok = true;
    for (const table of rows) {
      const same = expected[table] === restored[table];
      if (!same) ok = false;
      console.log(
        `  ${same ? 'OK  ' : 'BEDA'} ${table.padEnd(20)} backup=${expected[table] ?? '-'} restore=${restored[table] ?? '-'}`,
      );
    }
    if (!manifest)
      console.log(
        '  (manifest .json tidak ada, jumlah baris tidak bisa dibandingkan)',
      );
    console.log(
      ok && manifest
        ? 'Uji restore BERHASIL: semua tabel lengkap.'
        : 'Uji restore menemukan perbedaan, periksa di atas.',
    );
    if (!ok || !manifest) process.exitCode = 1;
  } finally {
    await serverQuery(`DROP DATABASE IF EXISTS "${checkDb}" WITH (FORCE)`);
  }
}

try {
  await (args.includes('--verify') ? verify() : backup());
} catch (err) {
  console.error(`[${time()}] BACKUP GAGAL: ${err.message}`);
  process.exit(1);
}
