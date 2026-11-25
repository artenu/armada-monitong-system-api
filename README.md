# gds-backend — Armada Monitoring System API

Backend REST API untuk Armada Monitoring System (GDS), PT Gapura Segara Borneo.
Mengikuti **Standar Tech Stack Artenu v2.3**: NestJS 12 (modular monolith, ESM) · Prisma 7 · PostgreSQL 18 · TypeScript strict.

Frontend ada di repo terpisah (`gds-frontend`). Kontrak API: `Backend_Frontend_Collaboration_Contract.md`.

## Kebutuhan

- Node.js **26** (lihat `.nvmrc`)
- Docker Desktop (untuk database development), atau PostgreSQL 18 sendiri

## Menjalankan di komputer development

```powershell
cp .env.example .env          # lalu isi password & JWT_ACCESS_SECRET
npm install                   # otomatis menjalankan prisma generate
npm run db:up                 # PostgreSQL 18 di Docker, port 5433
npx prisma migrate deploy     # buat tabel
npm run db:seed               # master data + akun awal (password dicetak sekali)
npm run start:dev             # http://localhost:8000/api/v1
```

- Dokumentasi API (Swagger): http://localhost:8000/api/docs
- Cek kesehatan: http://localhost:8000/api/v1/health
- Lihat isi database: `npm run db:studio`

## Script

| Script | Fungsi |
| --- | --- |
| `npm run start:dev` | Server development (auto-reload) |
| `npm run build` / `npm run start:prod` | Build lalu jalankan versi production |
| `npm run db:up` | Nyalakan PostgreSQL development (Docker) |
| `npm run db:migrate -- --name <nama>` | Buat migrasi baru setelah mengubah `prisma/schema.prisma` |
| `npm run db:deploy` | Terapkan migrasi (staging/production) |
| `npm run db:seed` | Isi master data & akun awal (aman diulang, tidak menimpa data) |
| `npm test` | Unit test (Vitest) |
| `npm run lint` | Lint (oxlint) |
| `npm run smoke -- <pw-admin> <pw-sales> <pw-ops> <pw-salesops> <pw-accounting>` | Uji alur lengkap ke server yang sedang jalan (**development saja**, membuat order uji) |

## Akun & role

| Role | Akses |
| --- | --- |
| `admin` | Semua menu, termasuk User Management & Master Data |
| `sales` | Buat/ubah/hapus draft order, kirim ke Operasional |
| `operasional` | Update operasional, dokumen trigger finance, selesai muat/bongkar |
| `sales_ops` | Gabungan akses Sales **dan** Operasional dalam satu akun |
| `finance` (Accounting) | Invoice, konfirmasi diterima, konfirmasi lunas |

Semua role yang login boleh **membaca** daftar order (Dashboard) dan master data (dropdown form).

Akun awal dibuat oleh `npm run db:seed`: `admin@`, `sales@`, `ops@`, `salesops@`, `accounting@armada.local`.
Password diambil dari `SEED_PASSWORD_<ROLE>` di `.env`, atau dibuat acak dan dicetak sekali. Ganti setelah login pertama.

## Alur status order

```
Draft Sales --(send-to-ops)--> Operational --(update ops)--> Proses Muat
   --(dokumen trigger / complete)--> Siap Ditagihkan --(invoice)--> Terkirim
   --(received)--> Diterima --(payment)--> Lunas
```

Semua aturan status ada di **`src/orders/order-workflow.ts`** (beserta tes di `order-workflow.spec.ts`).
Bila alur di frontend berubah, ubah file itu saja.

## Desain yang fleksibel terhadap perubahan frontend

- **Order, master data, tarif kontrak, tarif PNBP** disimpan dengan pola *kolom inti + JSON*:
  field yang dipakai filter/aturan menjadi kolom (status, customer, layanan, tanggal), sisanya di kolom `data` (JSONB).
  Field baru dari form frontend **otomatis tersimpan** tanpa migrasi database.
- Validasi body memakai **validasi fleksibel** (`src/common/validation.ts`): field inti dicek tipenya,
  field lain tidak dibuang. Endpoint dengan struktur tetap (login, user, complete, payment) memakai DTO biasa.
- Jenis master baru cukup ditambahkan di `src/master/master.constants.ts`.
- Role baru (mis. `direktur`): tambah di enum `UserRole` (`prisma/schema.prisma`) lalu `npm run db:migrate -- --name add-role-direktur`.

## Autentikasi (Standar v2.3 bagian 10)

- `POST /auth/login` → `{ user, token, expiresIn }`. `token` = access token JWT (15 menit), disimpan frontend di memori.
- Refresh token dikirim sebagai cookie **httpOnly** `armada_refresh` (path `/api/v1/auth`, 7 hari), dirotasi setiap dipakai.
  Token lama yang dipakai ulang mencabut seluruh sesi turunannya (deteksi pencurian).
- `POST /auth/refresh` (saat aplikasi dimuat & saat 401), `POST /auth/logout`, `GET /auth/me`.
- Password di-hash **argon2id**; pengecekan login memakai hash dummy agar tidak membocorkan email terdaftar.
- Login & refresh dibatasi throttler. Akun nonaktif/diganti password langsung kehilangan sesinya.

## Format respons

```json
{ "success": true, "message": "OK", "data": {} }
{ "success": false, "message": "Validasi gagal", "errors": [{ "field": "email", "message": "Format email tidak valid" }] }
```

Kode status: 401 belum login · 403 tidak berhak · 404 tidak ada · 409 bentrok status/data · 422 validasi gagal · 429 terlalu banyak percobaan.

## Upload berkas

`POST /files` (multipart, field `file`, maks `MAX_UPLOAD_MB`) → `{ url: "/uploads/<uuid>.pdf", name }`.
Jenis yang diizinkan: pdf, jpg, jpeg, png, webp, doc, docx, xls, xlsx. Berkas disajikan statis di `/uploads/*`
dengan nama acak (UUID). Folder `uploads/` **wajib ikut backup**.

## Penyimpangan dari standar yang disengaja

| Hal | Alasan |
| --- | --- |
| Kolom `data` JSONB untuk order & master | Form frontend masih sering berubah mengikuti MOM; menghindari migrasi mingguan |
| Nominal uang di dalam JSON masih `number` dari frontend | Mengikuti tipe frontend; kandidat dipindah ke kolom `Decimal` saat laporan keuangan dibuat |
| `/uploads` statis tanpa cek login | Sesuai kontrak (dibuka langsung oleh `<iframe>`/link); nama file UUID tidak bisa ditebak. Ganti ke endpoint berizin bila dibutuhkan |
| Test runner Vitest & linter oxlint | Bawaan NestJS 12 (standar v2.3 masih menyebut Jest/ESLint) |
| `DATABASE_URL` memakai `127.0.0.1` | Prisma di Windows gagal lewat `localhost` (IPv6) ke port Docker |

## Catatan dependency

- `overrides.@prisma/config.effect = 3.22.5`: menambal GHSA-7589-6fvf-x4pw (ReDoS) di Prisma CLI.
  Hapus override ini setelah Prisma merilis versi yang memakai effect >= 3.22.1.
- Prisma dikunci di **7.10.1** (tag `latest` npm sempat menunjuk ke 8.0 RC).
