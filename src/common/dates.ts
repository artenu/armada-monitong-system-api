const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

const parts = (date: Date, timeZone: string) => {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    formatted.find((p) => p.type === type)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
  };
};

/** Tanggal (YYYY-MM-DD) pada zona waktu bisnis, mis. "2026-11-25" */
export const toBusinessDate = (date: Date, timeZone: string): string => {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Tampilan waktu Indonesia, mis. "25 Nov 2026, 08:30" */
export const toDisplayDateTime = (date: Date, timeZone: string): string => {
  const p = parts(date, timeZone);
  return `${p.day} ${MONTHS_ID.at(Number(p.month) - 1)} ${p.year}, ${p.hour}:${p.minute}`;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Ubah "YYYY-MM-DD" menjadi Date (UTC tengah malam) untuk kolom @db.Date; selain itu null */
export const parseDateOnly = (value: unknown): Date | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const head = value.slice(0, 10);
  if (!DATE_ONLY.test(head)) {
    return null;
  }
  const date = new Date(`${head}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
