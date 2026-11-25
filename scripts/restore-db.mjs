// Restore darurat: kembalikan database aplikasi dari file backup.
//
//   npm run db:restore -- <file.dump> --confirm <nama-database>
//
// - Hentikan backend dulu (Ctrl+C di terminal "npm run start:dev" / service di server).
// - Sebelum menimpa, kondisi database saat ini DIBACKUP dulu (label pre-restore),
//   jadi restore yang salah pun masih bisa dibatalkan.
// - Berkas unggahan yang hilang dikembalikan dari cermin <BACKUP_DIR>/uploads/.
import 'dotenv/config';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  config,
  createBackup,
  readManifest,
  restoreInto,
  tableCounts,
} from './lib/db-backup.mjs';

const args = process.argv.slice(2);
const dumpArg = args.find((a) => a.endsWith('.dump'));
const confirmIdx = args.indexOf('--confirm');
const confirm = confirmIdx >= 0 ? args[confirmIdx + 1] : undefined;
const { dbName, backupDir, uploadDir } = config();

if (!dumpArg || confirm !== dbName) {
  console.error(
    `Restore akan MENGHAPUS isi database "${dbName}" lalu menggantinya dengan isi backup.\n` +
      `Pakai: npm run db:restore -- <file.dump> --confirm ${dbName}\n` +
      `Daftar backup ada di: ${backupDir}`,
  );
  process.exit(1);
}
const dumpFile = resolve(dumpArg);
if (!existsSync(dumpFile)) {
  console.error(`File tidak ditemukan: ${dumpFile}`);
  process.exit(1);
}

try {
  console.log('1/3 Backup kondisi saat ini (pre-restore)...');
  const safety = await createBackup({ label: 'pre-restore' });
  console.log(`    ${safety.dumpFile}`);

  console.log(`2/3 Restore ${dumpFile} -> ${dbName}...`);
  await restoreInto(dumpFile, dbName);
  const restored = await tableCounts(dbName);
  const expected = readManifest(dumpFile)?.tables;
  for (const [table, n] of Object.entries(restored)) {
    const mark =
      expected && expected[table] !== n ? `  (backup: ${expected[table]})` : '';
    console.log(`    ${table.padEnd(20)} ${n}${mark}`);
  }

  console.log('3/3 Mengembalikan berkas unggahan yang hilang...');
  const mirror = join(backupDir, 'uploads');
  let restoredFiles = 0;
  if (existsSync(mirror)) {
    mkdirSync(uploadDir, { recursive: true });
    for (const name of readdirSync(mirror)) {
      if (!existsSync(join(uploadDir, name))) {
        copyFileSync(join(mirror, name), join(uploadDir, name));
        restoredFiles++;
      }
    }
  }
  console.log(`    ${restoredFiles} berkas dikembalikan.`);
  console.log('\nRestore selesai. Nyalakan kembali backend.');
} catch (err) {
  console.error(`RESTORE GAGAL: ${err.message}`);
  process.exit(1);
}
