import {
  mergePositionHistory,
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

  describe('mergePositionHistory', () => {
    const now = new Date('2026-11-27T03:00:00Z');

    it('tidak mengubah log bila request tidak membawa posisi', () => {
      expect(
        mergePositionHistory({}, { finalDsr: 7500 }, 'Ops', now),
      ).toBeUndefined();
    });

    it('mencatat posisi lama dulu bila log masih kosong', () => {
      const result = mergePositionHistory(
        { position: 'Jetty ADP', positionUpdatedAt: '2026-11-26T08:00' },
        { position: 'Muara Berau', positionUpdatedAt: '2026-11-27T10:00' },
        'Staf Ops',
        now,
      );
      expect(result).toEqual([
        {
          position: 'Jetty ADP',
          timestamp: '2026-11-26T08:00',
          notes: undefined,
        },
        {
          position: 'Muara Berau',
          timestamp: '2026-11-27T10:00',
          notes: undefined,
          updatedBy: 'Staf Ops',
        },
      ]);
    });

    it('memakai log di server, bukan kiriman browser, dan nama user dari sesi', () => {
      const stored = {
        position: 'A',
        positionHistory: [
          { position: 'A', timestamp: '2026-11-26T08:00', updatedBy: 'Ops 1' },
        ],
      };
      const result = mergePositionHistory(
        stored,
        {
          position: 'B',
          positionUpdatedAt: '2026-11-27T09:00',
          positionHistory: [],
          updatedBy: 'Palsu',
        },
        'Ops 2',
        now,
      );
      expect(result?.map((e) => [e.position, e.updatedBy])).toEqual([
        ['A', 'Ops 1'],
        ['B', 'Ops 2'],
      ]);
    });

    it('tidak menggandakan entri bila posisi & waktu sama', () => {
      const stored = {
        position: 'A',
        positionHistory: [{ position: 'A', timestamp: '2026-11-27T09:00' }],
      };
      expect(
        mergePositionHistory(
          stored,
          { position: 'A', positionUpdatedAt: '2026-11-27T09:00' },
          'Ops',
          now,
        ),
      ).toHaveLength(1);
    });

    it('memakai waktu server bila waktu posisi tidak diisi', () => {
      expect(
        mergePositionHistory({}, { position: 'A' }, 'Ops', now)?.[0]?.timestamp,
      ).toBe('2026-11-27T03:00');
    });
  });
});
