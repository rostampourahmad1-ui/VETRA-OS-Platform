import { FormEvent, useEffect, useState } from 'react';
import { BarChart3, Plus, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { get, post, apiRequest } from '@/lib/phase2-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Baseline {
  id: number; projectId: number; name: string; version: number; isActive: number; description?: string | null; createdAt: string;
}
interface ProgressRecord {
  id: number; activityId: number; reportDate: string; progressPercent: number; actualStart?: string | null; actualFinish?: string | null; actualCost: string; actualLaborHours: string; notes?: string | null;
}
interface EvmMetric {
  id: number; reportDate: string; plannedValue: string; earnedValue: string; actualCost: string; costVariance: string; scheduleVariance: string; costPerformanceIndex: string; schedulePerformanceIndex: string; estimateAtCompletion: string; estimateToComplete: string;
}

export default function ProgressPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);
  const [evm, setEvm] = useState<EvmMetric[]>([]);
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blForm, setBlForm] = useState({ name: '', description: '' });
  const [prForm, setPrForm] = useState({ activityId: '', reportDate: '', progressPercent: '0', actualCost: '0', actualLaborHours: '0', notes: '' });
  const [evmForm, setEvmForm] = useState({ baselineId: '', reportDate: '', plannedValue: '0', earnedValue: '0', actualCost: '0' });

  const load = async (pid: string) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const [bl, pr, em] = await Promise.all([
        get<Baseline[]>(`/projects/${pid}/baselines`).catch(() => []),
        get<ProgressRecord[]>(`/projects/${pid}/progress`).catch(() => []),
        get<EvmMetric[]>(`/projects/${pid}/evm`).catch(() => []),
      ]);
      setBaselines(bl); setProgress(pr); setEvm(em);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load progress data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) void load(projectId); }, [projectId]);

  const createBaseline = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/baselines`, blForm); setBlForm({ name: '', description: '' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create baseline.'); }
  };

  const snapshotBaseline = async (baselineId: number) => {
    try { await post(`/baselines/${baselineId}/activities`, {}); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to snapshot baseline.'); }
  };

  const reportProgress = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/progress`, { ...prForm, activityId: Number(prForm.activityId), progressPercent: Number(prForm.progressPercent) }); setPrForm({ activityId: '', reportDate: '', progressPercent: '0', actualCost: '0', actualLaborHours: '0', notes: '' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to report progress.'); }
  };

  const calculateEvm = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/evm`, { ...evmForm, baselineId: Number(evmForm.baselineId) }); setEvmForm({ baselineId: '', reportDate: '', plannedValue: '0', earnedValue: '0', actualCost: '0' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to calculate EVM.'); }
  };

  const cpi = evm.length > 0 ? Number(evm[0].costPerformanceIndex) : 1;
  const spi = evm.length > 0 ? Number(evm[0].schedulePerformanceIndex) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PROJECT CONTROL / PROGRESS</p>
          <h1 className="text-3xl font-semibold tracking-tight">Progress & Baselines</h1>
          <p className="mt-1 text-muted-foreground">Track actual progress, manage baselines, and compute EVM metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="number" min="1" placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-32" />
          <Button variant="outline" onClick={() => projectId && load(projectId)} disabled={!projectId}><RefreshCw className="mr-2 h-4 w-4" />Load</Button>
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {evm.length > 0 && <div className="grid gap-4 md:grid-cols-4">
        {[['CPI', cpi.toFixed(2), cpi >= 1 ? 'Under budget' : 'Over budget', cpi >= 1 ? 'default' : 'destructive'],
          ['SPI', spi.toFixed(2), spi >= 1 ? 'Ahead of schedule' : 'Behind schedule', spi >= 1 ? 'default' : 'destructive'],
          ['EAC', `${Number(evm[0].estimateAtCompletion).toLocaleString()}`, 'Estimate at completion', 'outline'],
          ['ETC', `${Number(evm[0].estimateToComplete).toLocaleString()}`, 'Remaining to complete', 'outline'],
        ].map(([label, value, desc, variant]) => <Card key={label}><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Badge variant={variant as any}>{desc}</Badge></div><p className="text-2xl font-semibold mt-2">{value}</p></CardContent></Card>)}
      </div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />New baseline</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createBaseline}>
              <Input required placeholder="Baseline name" value={blForm.name} onChange={(e) => setBlForm({ ...blForm, name: e.target.value })} />
              <Input placeholder="Description" value={blForm.description} onChange={(e) => setBlForm({ ...blForm, description: e.target.value })} />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Create baseline</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />Report progress</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={reportProgress}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required type="number" min="1" placeholder="Activity ID" value={prForm.activityId} onChange={(e) => setPrForm({ ...prForm, activityId: e.target.value })} />
                <Input required type="date" value={prForm.reportDate} onChange={(e) => setPrForm({ ...prForm, reportDate: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input type="number" min="0" max="100" placeholder="Progress %" value={prForm.progressPercent} onChange={(e) => setPrForm({ ...prForm, progressPercent: e.target.value })} />
                <Input placeholder="Actual cost" value={prForm.actualCost} onChange={(e) => setPrForm({ ...prForm, actualCost: e.target.value })} />
                <Input placeholder="Labor hours" value={prForm.actualLaborHours} onChange={(e) => setPrForm({ ...prForm, actualLaborHours: e.target.value })} />
              </div>
              <Textarea placeholder="Notes" value={prForm.notes} onChange={(e) => setPrForm({ ...prForm, notes: e.target.value })} />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Report progress</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Calculate EVM</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={calculateEvm}>
              <Input required type="number" min="1" placeholder="Baseline ID" value={evmForm.baselineId} onChange={(e) => setEvmForm({ ...evmForm, baselineId: e.target.value })} />
              <Input required type="date" value={evmForm.reportDate} onChange={(e) => setEvmForm({ ...evmForm, reportDate: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Planned value (PV)" value={evmForm.plannedValue} onChange={(e) => setEvmForm({ ...evmForm, plannedValue: e.target.value })} />
                <Input placeholder="Earned value (EV)" value={evmForm.earnedValue} onChange={(e) => setEvmForm({ ...evmForm, earnedValue: e.target.value })} />
                <Input placeholder="Actual cost (AC)" value={evmForm.actualCost} onChange={(e) => setEvmForm({ ...evmForm, actualCost: e.target.value })} />
              </div>
              <Button type="submit"><BarChart3 className="mr-2 h-4 w-4" />Calculate</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Baselines <span className="text-sm font-normal text-muted-foreground">({baselines.length})</span></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : baselines.length === 0 ? <p className="text-sm text-muted-foreground">No baselines defined.</p> : <div className="space-y-3">{baselines.map((bl) => <div key={bl.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{bl.name} <span className="text-xs text-muted-foreground">v{bl.version}</span></h3><p className="text-sm text-muted-foreground">{bl.description || '—'}</p></div><div className="flex items-center gap-2">{bl.isActive ? <Badge variant="default">Active</Badge> : null}<Button variant="outline" size="sm" onClick={() => snapshotBaseline(bl.id)}>Snapshot</Button></div></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Progress <span className="text-sm font-normal text-muted-foreground">({progress.length})</span></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : progress.length === 0 ? <p className="text-sm text-muted-foreground">No progress records.</p> : <div className="space-y-3">{progress.slice(0, 10).map((pr) => <div key={pr.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">Activity #{pr.activityId}</h3><p className="text-xs text-muted-foreground">{pr.reportDate}</p></div><Badge variant={pr.progressPercent >= 100 ? 'default' : pr.progressPercent > 0 ? 'secondary' : 'outline'}>{pr.progressPercent}%</Badge></div>{pr.notes && <p className="mt-1 text-xs text-muted-foreground">{pr.notes}</p>}</div>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
