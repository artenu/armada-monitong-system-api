/**
 * Aturan alur status order (Sales -> Operasional -> Finance).
 * Mengikuti perilaku mode simulasi frontend (kontrak bagian 1.3).
 *
 * SEMUA aturan status ada di file ini, sehingga bila alur frontend berubah
 * cukup ubah konstanta/fungsi di sini (dan tes di order-workflow.spec.ts).
 */

export const ORDER_STATUSES = [
  'Draft Sales',
  'Operational',
  'Proses Muat',
  'Selesai Muat',
  'Siap Ditagihkan',
  'Menunggu Pembayaran',
  'Terkirim',
  'Diterima',
  'Lunas',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DRAFT_STATUS: OrderStatus = 'Draft Sales';

/** Status tahap Finance: update dari Operasional tidak boleh memundurkannya */
export const BILLING_STAGE_STATUSES: readonly string[] = [
  'Siap Ditagihkan',
  'Menunggu Pembayaran',
  'Terkirim',
  'Diterima',
  'Lunas',
];

/** Status yang boleh ditetapkan form Operasional (dihitung frontend dari trigger dokumen) */
export const OPERATIONAL_SETTABLE_STATUSES: readonly string[] = [
  'Proses Muat',
  'Selesai Muat',
  'Siap Ditagihkan',
];

/** Status yang tampil di halaman Billing */
export const BILLING_LIST_STATUSES: readonly string[] = BILLING_STAGE_STATUSES;

/** Asal status yang sah untuk tiap aksi Finance */
export const INVOICE_FROM: readonly string[] = [
  'Siap Ditagihkan',
  'Menunggu Pembayaran',
];
export const RECEIVE_FROM: readonly string[] = ['Terkirim'];
export const PAYMENT_FROM: readonly string[] = ['Terkirim', 'Diterima'];

/** Field yang dikelola backend dan tidak boleh ditimpa body dari klien */
export const PROTECTED_ORDER_KEYS = [
  'id',
  'status',
  'orderNo',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdById',
] as const;

export const isBillingStage = (status: string) =>
  BILLING_STAGE_STATUSES.includes(status);

/** Status setelah Operasional menyimpan update (mock: payload.status ?? "Proses Muat") */
export const resolveOperationalStatus = (
  current: string,
  requested: unknown,
): string => {
  if (isBillingStage(current)) {
    return current;
  }
  if (
    typeof requested === 'string' &&
    OPERATIONAL_SETTABLE_STATUSES.includes(requested)
  ) {
    return requested;
  }
  return 'Proses Muat';
};

/** Status setelah konfirmasi Selesai Muat/Bongkar */
export const resolveCompleteStatus = (current: string): string =>
  isBillingStage(current) ? current : 'Siap Ditagihkan';

/** Nomor job berikutnya: JOB-<tahun>-NNN dari nomor terbesar (termasuk yang sudah dihapus) */
export const nextOrderNo = (
  existing: readonly string[],
  year: string,
): string => {
  const prefix = `JOB-${year}-`;
  const max = existing.reduce((acc, no) => {
    if (!no.startsWith(prefix)) {
      return acc;
    }
    const n = Number(no.slice(prefix.length));
    return Number.isInteger(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

/** Satu entri log perpindahan lokasi armada (MOM 25 Nov poin 7) */
export interface PositionHistoryEntry {
  position: string;
  /** Waktu posisi menurut petugas (YYYY-MM-DDTHH:mm) */
  timestamp: string;
  notes?: string;
  /** Nama user dari sesi login (bukan dari body request) */
  updatedBy?: string;
}

const isEntry = (v: unknown): v is PositionHistoryEntry =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PositionHistoryEntry).position === 'string' &&
  typeof (v as PositionHistoryEntry).timestamp === 'string';

const textOf = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * Susun log perpindahan lokasi di SERVER, dari data order yang tersimpan (bukan dari
 * `positionHistory` kiriman browser yang bisa sudah usang). Aturannya sama dengan frontend:
 * - log kosong + posisi lama berbeda dari posisi baru -> posisi lama dicatat dulu,
 * - entri baru ditambahkan bila posisi atau waktunya berbeda dari entri terakhir.
 * Mengembalikan `undefined` bila request tidak mengubah posisi (log dibiarkan apa adanya).
 */
export const mergePositionHistory = (
  stored: Record<string, unknown>,
  payload: Record<string, unknown>,
  userName: string,
  now: Date = new Date(),
): PositionHistoryEntry[] | undefined => {
  const position = textOf(payload.position);
  if (!position) {
    return undefined;
  }
  const timestamp =
    textOf(payload.positionUpdatedAt) ?? now.toISOString().slice(0, 16);
  const history = Array.isArray(stored.positionHistory)
    ? stored.positionHistory.filter(isEntry)
    : [];

  const previous = textOf(stored.position);
  if (history.length === 0 && previous && previous !== position) {
    history.push({
      position: previous,
      timestamp:
        textOf(stored.positionUpdatedAt) ??
        textOf(stored.startDate) ??
        timestamp,
      notes: textOf(stored.operationalNotes),
    });
  }

  const last = history.at(-1);
  if (!last || last.position !== position || last.timestamp !== timestamp) {
    history.push({
      position,
      timestamp,
      notes: textOf(payload.operationalNotes),
      updatedBy: userName,
    });
  }
  return history;
};
