/**
 * Daftar resource master data generik beserta prefix kodenya (sama dengan MASTER_CONFIGS frontend).
 * Menambah jenis master baru cukup menambah satu baris di sini, tanpa migrasi database.
 */
export const MASTER_RESOURCES = {
  customer: 'CUST',
  'tug-boat': 'TB',
  barge: 'BG',
  vessel: 'MV',
  lokasi: 'LOK',
  'drop-point': 'LOC',
  pol: 'POL',
  pod: 'POD',
  agen: 'AGN',
} as const;

export type MasterResource = keyof typeof MASTER_RESOURCES;

export const isMasterResource = (value: string): value is MasterResource =>
  Object.hasOwn(MASTER_RESOURCES, value);
