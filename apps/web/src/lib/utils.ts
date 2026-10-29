import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNowStrict, format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return '';
  const date = typeof d === 'string' ? parseISO(d) : d;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function dueLabel(d: string | null | undefined) {
  if (!d) return null;
  const date = parseISO(d);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

export function isOverdue(d: string | null | undefined, status?: string) {
  if (!d || status === 'done') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseISO(d) < today;
}

export function fmtTime(d: string | Date) {
  return format(typeof d === 'string' ? parseISO(d) : d, 'h:mm a');
}

export function fmtDateTime(d: string | Date) {
  return format(typeof d === 'string' ? parseISO(d) : d, 'MMM d, h:mm a');
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Mix a hex colour with white (amount 0..1). */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const m = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1)}`;
}
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const m = (c: number) => Math.round(c * (1 - amount));
  return `#${((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1)}`;
}
