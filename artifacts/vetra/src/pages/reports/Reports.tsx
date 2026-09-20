import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/phase2-api';
import { formatJalaliLong } from '@/lib/jalali';

export default function Reports() {
  const [report, setReport] = useState<any>(null);
  const load = () => get('/reports/summary').then(setReport).catch(() => setReport(null));
  useEffect(() => { load(); }, []);
  const cards = [['پروژه‌ها', report?.projects?.total ?? 0, `${report?.projects?.active ?? 0} فعال`], ['وظایف', report?.tasks?.total ?? 0, `${report?.tasks?.completed ?? 0} تکمیل‌شده`], ['وظایف باز', report?.tasks?.open ?? 0, 'نیازمند پیگیری']];
  return <div className="space-y-6" dir="rtl"><div className="flex justify-between items-start"><div><p className="text-xs font-mono tracking-widest text-primary">گزارش مدیریتی</p><h1 className="text-3xl font-bold mt-2">گزارش‌ها</h1><p className="text-muted-foreground mt-2">خلاصه‌ای از وضعیت پروژه‌ها و عملیات سازمان.</p></div><div className="flex gap-2"><Button variant="outline" className="gap-2" onClick={load}><RefreshCw className="h-4 w-4" /> تازه‌سازی</Button><Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> خروجی</Button></div></div><p className="text-xs text-muted-foreground">تولیدشده در {formatJalaliLong(report?.generatedAt)}</p><div className="grid gap-4 md:grid-cols-3">{cards.map(([title, value, sub]) => <Card key={String(title)}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{value}</p><p className="text-sm text-muted-foreground mt-1">{sub}</p></CardContent></Card>)}</div></div>;
}
