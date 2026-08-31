import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Calendar, GitBranch, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { get, post, apiRequest } from '@/lib/phase2-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';

interface Calendar {
  id: number; projectId: number; name: string; description?: string | null;
  workDays: string; workStartHour: string; workEndHour: string; isDefault: number;
}
interface Dependency {
  id: number; predecessorId: number; successorId: number; dependencyType: string; lagDays: number;
}
interface CpmActivity {
  id: number; code: string; name: string; earlyStart: number; earlyFinish: number;
  lateStart: number; lateFinish: number; totalFloat: number; durationDays: number;
}

export default function SchedulingPage() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [cpm, setCpm] = useState<{ activities: CpmActivity[]; criticalPath: number[]; projectFinishDays: number } | null>(null);
  const { project } = useOrganizationProject();
  const projectId = project?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [calForm, setCalForm] = useState({ name: '', workDays: '1,2,3,4,5,6', workStartHour: '08:00', workEndHour: '17:00' });
  const [depForm, setDepForm] = useState({ predecessorId: '', successorId: '', dependencyType: 'FS', lagDays: '0' });

  const load = async (pid: number) => {
    if (!pid) return;
    setLoading(true); setError('');
    try {
      const [cals, deps, cpmData] = await Promise.all([
        get<Calendar[]>(`/projects/${pid}/calendars`).catch(() => []),
        get<Dependency[]>(`/projects/${pid}/dependencies`).catch(() => []),
        get<{ activities: CpmActivity[]; criticalPath: number[]; projectFinishDays: number }>(`/projects/${pid}/cpm`).catch(() => null),
      ]);
      setCalendars(cals); setDependencies(deps); setCpm(cpmData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load scheduling data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) void load(projectId); }, [projectId]);

  const createCalendar = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/calendars`, calForm); setCalForm({ name: '', workDays: '1,2,3,4,5,6', workStartHour: '08:00', workEndHour: '17:00' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create calendar.'); }
  };

  const createDependency = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/dependencies`, { ...depForm, predecessorId: Number(depForm.predecessorId), successorId: Number(depForm.successorId), lagDays: Number(depForm.lagDays) }); setDepForm({ predecessorId: '', successorId: '', dependencyType: 'FS', lagDays: '0' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create dependency.'); }
  };

  const removeCalendar = async (id: number) => { try { await apiRequest(`/calendars/${id}`, { method: 'DELETE' }); if (projectId) await load(projectId); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } };
  const removeDependency = async (id: number) => { try { await apiRequest(`/dependencies/${id}`, { method: 'DELETE' }); if (projectId) await load(projectId); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } };

  const criticalIds = useMemo(() => new Set(cpm?.criticalPath ?? []), [cpm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">کنترل پروژه / زمان‌بندی</p>
          <h1 className="text-3xl font-semibold tracking-tight">زمان‌بندی و گانت</h1>
          <p className="mt-1 text-muted-foreground">تقویم‌ها، وابستگی فعالیت‌ها و محاسبات CPM پروژهٔ فعال را مدیریت کنید.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm" aria-label="پروژهٔ فعال">پروژهٔ فعال: {project?.name ?? 'انتخاب نشده'}</div>
          <Button variant="outline" onClick={() => projectId && load(projectId)} disabled={!projectId}><RefreshCw className="mr-2 h-4 w-4" />بارگذاری</Button>
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />New calendar</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createCalendar}>
              <Input required placeholder="Calendar name" value={calForm.name} onChange={(e) => setCalForm({ ...calForm, name: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Work days (0-6)" value={calForm.workDays} onChange={(e) => setCalForm({ ...calForm, workDays: e.target.value })} />
                <Input placeholder="Start hour" value={calForm.workStartHour} onChange={(e) => setCalForm({ ...calForm, workStartHour: e.target.value })} />
                <Input placeholder="End hour" value={calForm.workEndHour} onChange={(e) => setCalForm({ ...calForm, workEndHour: e.target.value })} />
              </div>
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Create calendar</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" />New dependency</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createDependency}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required type="number" min="1" placeholder="Predecessor activity ID" value={depForm.predecessorId} onChange={(e) => setDepForm({ ...depForm, predecessorId: e.target.value })} />
                <Input required type="number" min="1" placeholder="Successor activity ID" value={depForm.successorId} onChange={(e) => setDepForm({ ...depForm, successorId: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={depForm.dependencyType} onChange={(e) => setDepForm({ ...depForm, dependencyType: e.target.value })}>
                  <option value="FS">Finish-to-Start (FS)</option><option value="SS">Start-to-Start (SS)</option>
                  <option value="FF">Finish-to-Finish (FF)</option><option value="SF">Start-to-Finish (SF)</option>
                </select>
                <Input type="number" min="0" placeholder="Lag days" value={depForm.lagDays} onChange={(e) => setDepForm({ ...depForm, lagDays: e.target.value })} />
              </div>
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Add dependency</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Calendars <span className="text-sm font-normal text-muted-foreground">({calendars.length})</span></CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : calendars.length === 0 ? <p className="text-sm text-muted-foreground">No calendars defined.</p> : <div className="space-y-3">{calendars.map((cal) => <div key={cal.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{cal.name}</h3><p className="text-sm text-muted-foreground">Days: {cal.workDays} · {cal.workStartHour}–{cal.workEndHour}</p></div><div className="flex items-center gap-2">{cal.isDefault ? <Badge variant="default">پیش‌فرض</Badge> : null}<Button variant="ghost" size="icon" onClick={() => removeCalendar(cal.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dependencies <span className="text-sm font-normal text-muted-foreground">({dependencies.length})</span></CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : dependencies.length === 0 ? <p className="text-sm text-muted-foreground">No dependencies defined.</p> : <div className="space-y-3">{dependencies.map((dep) => <div key={dep.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">Activity #{dep.predecessorId} → #{dep.successorId}</h3><p className="text-xs text-muted-foreground">{dep.dependencyType} · Lag: {dep.lagDays} day(s)</p></div><Button variant="ghost" size="icon" onClick={() => removeDependency(dep.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div>}
          </CardContent>
        </Card>
      </div>

      {cpm && (
        <Card>
          <CardHeader>
            <CardTitle>CPM Analysis <span className="text-sm font-normal text-muted-foreground">· Project finish: day {cpm.projectFinishDays} · Critical path: {cpm.criticalPath.length} activities</span></CardTitle>
          </CardHeader>
          <CardContent>
            {cpm.activities.length === 0 ? <p className="text-sm text-muted-foreground">No activities found.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="pb-2 font-medium">Code</th><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">ES</th><th className="pb-2 font-medium">EF</th><th className="pb-2 font-medium">LS</th><th className="pb-2 font-medium">LF</th><th className="pb-2 font-medium">Float</th><th className="pb-2 font-medium">Duration</th><th className="pb-2 font-medium">Critical</th></tr></thead><tbody>{cpm.activities.map((a) => <tr key={a.id} className={`border-b last:border-0 ${criticalIds.has(a.id) ? 'bg-destructive/5' : ''}`}><td className="py-2 font-mono text-xs">{a.code}</td><td className="py-2">{a.name}</td><td className="py-2 font-mono">{a.earlyStart}</td><td className="py-2 font-mono">{a.earlyFinish}</td><td className="py-2 font-mono">{a.lateStart}</td><td className="py-2 font-mono">{a.lateFinish}</td><td className="py-2 font-mono">{a.totalFloat}</td><td className="py-2 font-mono">{a.durationDays}</td><td className="py-2">{criticalIds.has(a.id) ? <Badge variant="destructive">Critical</Badge> : <Badge variant="outline">—</Badge>}</td></tr>)}</tbody></table></div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
