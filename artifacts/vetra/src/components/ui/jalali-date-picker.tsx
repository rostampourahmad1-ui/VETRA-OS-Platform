import { useMemo, useState } from 'react';
import { format, getDate, getMonth, getYear, parse, setDate, setMonth, setYear } from 'date-fns-jalali';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function dateFromValue(value?: string): Date {
  return value ? new Date(`${value}T00:00:00`) : new Date();
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function JalaliDatePicker({
  value,
  onChange,
  id,
  className,
  disabled,
}: {
  value?: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => dateFromValue(value), [value]);
  const [view, setView] = useState(selected);
  const year = getYear(view);
  const month = getMonth(view);
  const day = getDate(selected);
  const daysInMonth = month < 6 ? 31 : month < 11 ? 30 : (year % 4 === 3 ? 30 : 29);
  const firstDay = (parse(`${year}/${String(month + 1).padStart(2, '0')}/01`, 'yyyy/MM/dd', new Date()).getDay() + 1) % 7;

  const choose = (next: Date) => {
    onChange(toIsoDate(next));
    setView(next);
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)} dir="rtl">
      <Button id={id} type="button" variant="outline" disabled={disabled} onClick={() => { setView(selected); setOpen(!open); }} className="w-full justify-between font-normal">
        <span>{value ? format(selected, 'yyyy/MM/dd') : 'انتخاب تاریخ'}</span>
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-3 flex items-center gap-2">
            <select aria-label="ماه" value={month} onChange={(e) => setView(setMonth(view, Number(e.target.value)))} className="h-9 flex-1 rounded-md border bg-background px-2 text-sm">
              {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
            <select aria-label="سال" value={year} onChange={(e) => setView(setYear(view, Number(e.target.value)))} className="h-9 w-24 rounded-md border bg-background px-2 text-sm">
              {Array.from({ length: 31 }, (_, index) => year - 15 + index).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{weekDays.map((name) => <span key={name} className="py-1">{name}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((item) => {
              const candidate = setDate(view, item);
              const isSelected = value && format(selected, 'yyyy/MM/dd') === format(candidate, 'yyyy/MM/dd');
              return <button key={item} type="button" onClick={() => choose(candidate)} className={cn('h-9 rounded-md text-sm hover:bg-accent', isSelected && 'bg-primary text-primary-foreground')}>{item}</button>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
