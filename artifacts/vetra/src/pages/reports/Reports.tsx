import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { get } from '@/lib/phase2-api';
import { formatCurrency, formatJalaliLong } from '@/lib/jalali';

export default function Reports() {
  const [report, setReport] = useState<any>(null);
  const load = () => get('/reports/summary').then(setReport).catch(() => setReport(null));
  useEffect(() => { load(); }, []);
  return <div className="space-y-6"><div className="flex justify-between items-start"><div><p className="text-xs font-mono tracking-widest text-primary">EXECUTIVE INTELLIGENCE</p><h1 className="text-3xl font-bold mt-2">Reports</h1><p className="text-muted-foreground mt-2">A concise operating summary for portfolio reviews.</p></div><div className="flex gap-2"><Button variant="outline" className="gap-2" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button><Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button></div></div><p className="text-xs text-muted-foreground">Generated {formatJalaliLong(report?.generatedAt)}</p><div className="grid gap-4 md:grid-cols-3">{[['Projects', report?.projects?.total ?? 0, `${report?.projects?.active ?? 0} active`], ['Tasks', report?.tasks?.total ?? 0, `${report?.tasks?.completed ?? 0} completed`], ['Cost utilization', `${report?.costs?.utilization ?? 0}%`, `${formatCurrency(Number(report?.costs?.variance ?? 0))} variance`]].map(([title, value, sub]) => <Card key={String(title)}><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{value}</p><p className="text-sm text-muted-foreground mt-1">{sub}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Cost comparison</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-4"><div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Budget</p><p className="text-xl font-semibold mt-1">{formatCurrency(Number(report?.costs?.budget ?? 0))}</p></div><div className="rounded-lg bg-primary/10 p-4"><p className="text-sm text-muted-foreground">Actual spend</p><p className="text-xl font-semibold mt-1">{formatCurrency(Number(report?.costs?.spent ?? 0))}</p></div></div></CardContent></Card></div>;
}
