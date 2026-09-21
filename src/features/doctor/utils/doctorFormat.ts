/**
 * Shared formatting for the doctor portal.
 *
 * Every doctor screen used to carry its own copy of a 12-hour time formatter
 * and parsed `YYYY-MM-DD` strings with `new Date(str)`, which JavaScript reads
 * as UTC midnight. In any timezone behind UTC that renders the previous day,
 * and `toISOString()` for "today" returns yesterday after local midnight in
 * timezones ahead of UTC. These helpers keep calendar dates in local time.
 */

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Monday-first display order used by schedule screens (0 = Sunday). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** `HH:MM[:SS]` → `9:00 AM`. */
export const formatTime12h = (time?: string | null): string => {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
};

/** `HH:MM[:SS]` → minutes since midnight. */
export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
};

/** Date → `HH:MM:00` in local time, as stored in `doctor_schedules`. */
export const dateToTimeString = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;

/** `HH:MM[:SS]` → a Date today at that local time (for time pickers). */
export const timeStringToDate = (time: string): Date => {
  const [h, m] = time.split(':');
  const date = new Date();
  date.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return date;
};

/** Local calendar key `YYYY-MM-DD`. */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** `YYYY-MM-DD` → local midnight Date. */
export const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const todayKey = (): string => toDateKey(new Date());

/** Inclusive list of local date keys between two dates. */
export const dateKeysBetween = (start: Date, end: Date): string[] => {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

export const formatDateKey = (
  key: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string => parseDateKey(key).toLocaleDateString(undefined, options);

export const greetingForHour = (hour = new Date().getHours()): string => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/**
 * Doctor names are stored with or without the title ("Dr. Sarah Ahmed",
 * "Dr Sameen Afzal"). Prefixing unconditionally rendered "Dr. Dr. Sarah Ahmed".
 */
export const doctorDisplayName = (name?: string | null): string => {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Doctor';
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
};
