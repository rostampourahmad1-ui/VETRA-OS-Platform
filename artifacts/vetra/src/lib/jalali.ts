import { format, formatDistanceToNow } from 'date-fns-jalali';

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatJalali(value: string | Date | null | undefined, pattern = 'yyyy/MM/dd'): string {
  const date = toDate(value);
  return date ? format(date, pattern) : '—';
}

export function formatJalaliLong(value: string | Date | null | undefined): string {
  return formatJalali(value, 'd MMMM yyyy');
}

export function formatRelativeJalali(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

export const persianNumber = (value: string | number): string =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
