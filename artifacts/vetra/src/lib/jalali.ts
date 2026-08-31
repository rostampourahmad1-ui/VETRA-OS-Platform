import { format } from 'date-fns-jalali';

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

export function formatRelativeJalali(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);
  if (!date) return '—';
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${persianNumber(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${persianNumber(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${persianNumber(days)} روز پیش`;
  return formatJalali(date);
}

export const persianNumber = (value: string | number): string =>
  String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('fa-IR', { style: 'currency', currency: 'IRR', maximumFractionDigits: 0 }).format(value);
