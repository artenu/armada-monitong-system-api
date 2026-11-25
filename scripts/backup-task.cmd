@echo off
rem Dipanggil Windows Task Scheduler: backup harian database + berkas unggahan.
rem Log: backups\backup.log. Docker Desktop (database) harus sedang berjalan.
cd /d "%~dp0.."
if not exist backups mkdir backups
node scripts\backup-db.mjs >> backups\backup.log 2>&1
