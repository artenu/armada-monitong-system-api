import {
  nextOrderNo,
  resolveCompleteStatus,
  resolveOperationalStatus,
} from './order-workflow.js';

describe('order-workflow', () => {
  describe('nextOrderNo', () => {
    it('mulai dari 001 untuk tahun baru', () => {
      expect(nextOrderNo([], '2026')).toBe('JOB-2026-001');
    });

    it('memakai nomor terbesar, bukan jumlah data', () => {
      expect(
        nextOrderNo(['JOB-2026-001', 'JOB-2026-007', 'JOB-2025-099'], '2026'),
      ).toBe('JOB-2026-008');
    });
  });

  describe('resolveOperationalStatus', () => {
    it('default "Proses Muat"', () => {
      expect(resolveOperationalStatus('Operational', undefined)).toBe(
        'Proses Muat',
      );
    });

    it('menerima "Siap Ditagihkan" dari trigger dokumen frontend', () => {
      expect(resolveOperationalStatus('Proses Muat', 'Siap Ditagihkan')).toBe(
        'Siap Ditagihkan',
      );
    });

    it('menolak status di luar wewenang Operasional', () => {
      expect(resolveOperationalStatus('Proses Muat', 'Lunas')).toBe(
        'Proses Muat',
      );
    });

    it('tidak memundurkan order yang sudah di tahap Finance', () => {
      expect(resolveOperationalStatus('Terkirim', 'Proses Muat')).toBe(
        'Terkirim',
      );
    });
  });

  describe('resolveCompleteStatus', () => {
    it('order aktif menjadi "Siap Ditagihkan"', () => {
      expect(resolveCompleteStatus('Proses Muat')).toBe('Siap Ditagihkan');
    });

    it('order yang sudah lunas tetap lunas', () => {
      expect(resolveCompleteStatus('Lunas')).toBe('Lunas');
    });
  });
});
