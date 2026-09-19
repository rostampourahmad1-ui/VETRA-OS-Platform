import { t } from '@/lib/i18n';
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
  const [calendarSchedule, setCalendarSchedule] = useState<{ calendarAdjusted: boolean; activities: any[]; workDays?: string } | null>(null);
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
      const [cals, deps, cpmData, calSched] = await Promise.all([
        get<Calendar[]>(`/projects/${pid}/calendars`).catch(() => []),
        get<Dependency[]>(`/projects/${pid}/dependencies`).catch(() => []),
        get<{ activities: CpmActivity[]; criticalPath: number[]; projectFinishDays: number }>(`/projects/${pid}/cpm`).catch(() => null),
        get<{ calendarAdjusted: boolean; activities: any[]; workDays?: string } | null>(`/projects/${pid}/calendar-schedule`).catch(() => null),
      ]);
      setCalendars(cals); setDependencies(deps); setCpm(cpmData); setCalendarSchedule(calSched);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('scheduling.loadFailed')); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) void load(projectId); }, [projectId]);

  const createCalendar = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/calendars`, calForm); setCalForm({ name: '', workDays: '1,2,3,4,5,6', workStartHour: '08:00', workEndHour: '17:00' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('scheduling.createCalendarFailed')); }
  };

  const createDependency = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/dependencies`, { ...depForm, predecessorId: Number(depForm.predecessorId), successorId: Number(depForm.successorId), lagDays: Number(depForm.lagDays) }); setDepForm({ predecessorId: '', successorId: '', dependencyType: 'FS', lagDays: '0' }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('scheduling.createDependencyFailed')); }
  };

  const removeCalendar = async (id: number) => { try { await apiRequest(`/calendars/${id}`, { method: 'DELETE' }); if (projectId) await load(projectId); } catch (cause) { setError(cause instanceof Error ? cause.message : t('scheduling.deleteFailed')); } };
  const removeDependency = async (id: number) => { try { await apiRequest(`/dependencies/${id}`, { method: 'DELETE' }); if (projectId) await load(projectId); } catch (cause) { setError(cause instanceof Error ? cause.message : t('scheduling.deleteFailed')); } };

  const criticalIds = useMemo(() => new Set(cpm?.criticalPath ?? []), [cpm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">{t('scheduling.breadcrumb')}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t('scheduling.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('scheduling.desc')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm" aria-label={t('scheduling.activeProject')}>{t('scheduling.activeProject')}: {project?.name ?? t('scheduling.notSelected')}</div>
          <Button variant="outline" onClick={() => projectId && load(projectId)} disabled={!projectId}><RefreshCw className="me-2 h-4 w-4" />{t('scheduling.load')}</Button>
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />{t('scheduling.newCalendar')}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createCalendar}>
              <Input required placeholder={t('scheduling.calendarName')} value={calForm.name} onChange={(e) => setCalForm({ ...calForm, name: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder={t('scheduling.workDaysPlaceholder')} value={calForm.workDays} onChange={(e) => setCalForm({ ...calForm, workDays: e.target.value })} />
                <Input placeholder={t('scheduling.startHour')} value={calForm.workStartHour} onChange={(e) => setCalForm({ ...calForm, workStartHour: e.target.value })} />
                <Input placeholder={t('scheduling.endHour')} value={calForm.workEndHour} onChange={(e) => setCalForm({ ...calForm, workEndHour: e.target.value })} />
              </div>
              <Button type="submit"><Plus className="me-2 h-4 w-4" />{t('scheduling.createCalendar')}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-5 w-5" />{t('scheduling.newDependency')}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createDependency}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required type="number" min="1" placeholder={t('scheduling.predecessorId')} value={depForm.predecessorId} onChange={(e) => setDepForm({ ...depForm, predecessorId: e.target.value })} />
                <Input required type="number" min="1" placeholder={t('scheduling.successorId')} value={depForm.successorId} onChange={(e) => setDepForm({ ...depForm, successorId: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={depForm.dependencyType} onChange={(e) => setDepForm({ ...depForm, dependencyType: e.target.value })}>
                  <option value="FS">{t('scheduling.depFS')}</option><option value="SS">{t('scheduling.depSS')}</option>
                  <option value="FF">{t('scheduling.depFF')}</option><option value="SF">{t('scheduling.depSF')}</option>
                </select>
                <Input type="number" min="0" placeholder={t('scheduling.lagDays')} value={depForm.lagDays} onChange={(e) => setDepForm({ ...depForm, lagDays: e.target.value })} />
              </div>
              <Button type="submit"><Plus className="me-2 h-4 w-4" />{t('scheduling.addDependency')}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('scheduling.calendars')} <span className="text-sm font-normal text-muted-foreground">({calendars.length})</span></CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">{t('scheduling.loading')}</p> : calendars.length === 0 ? <p className="text-sm text-muted-foreground">{t('scheduling.noCalendars')}</p> : <div className="space-y-3">{calendars.map((cal) => <div key={cal.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{cal.name}</h3><p className="text-sm text-muted-foreground">{t('scheduling.daysLabel', { days: cal.workDays, start: cal.workStartHour, end: cal.workEndHour })}</p></div><div className="flex items-center gap-2">{cal.isDefault ? <Badge variant="default">{t('scheduling.default')}</Badge> : null}<Button variant="ghost" size="icon" onClick={() => removeCalendar(cal.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('scheduling.dependencies')} <span className="text-sm font-normal text-muted-foreground">({dependencies.length})</span></CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">{t('scheduling.loading')}</p> : dependencies.length === 0 ? <p className="text-sm text-muted-foreground">{t('scheduling.noDependencies')}</p> : <div className="space-y-3">{dependencies.map((dep) => <div key={dep.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">{t('scheduling.activityRange', { from: dep.predecessorId, to: dep.successorId })}</h3><p className="text-xs text-muted-foreground">{t('scheduling.depLine', { type: dep.dependencyType, lag: dep.lagDays })}</p></div><Button variant="ghost" size="icon" onClick={() => removeDependency(dep.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>)}</div>}
          </CardContent>
        </Card>
      </div>

      {cpm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('scheduling.cpmAnalysis')} <span className="text-sm font-normal text-muted-foreground">{t('scheduling.cpmSummary', { finish: cpm.projectFinishDays, count: cpm.criticalPath.length })}</span></CardTitle>
          </CardHeader>
          <CardContent>
            {cpm.activities.length === 0 ? <p className="text-sm text-muted-foreground">{t('scheduling.noActivities')}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="pb-2 font-medium">{t('scheduling.colCode')}</th><th className="pb-2 font-medium">{t('scheduling.colName')}</th><th dir="ltr" className="pb-2 font-medium">ES</th><th dir="ltr" className="pb-2 font-medium">EF</th><th dir="ltr" className="pb-2 font-medium">LS</th><th dir="ltr" className="pb-2 font-medium">LF</th><th className="pb-2 font-medium">{t('scheduling.colFloat')}</th><th className="pb-2 font-medium">{t('scheduling.colDuration')}</th><th className="pb-2 font-medium">{t('scheduling.colCritical')}</th></tr></thead><tbody>{cpm.activities.map((a) => <tr key={a.id} className={`border-b last:border-0 ${criticalIds.has(a.id) ? 'bg-destructive/5' : ''}`}><td className="py-2 font-mono text-xs">{a.code}</td><td className="py-2">{a.name}</td><td className="py-2 font-mono">{a.earlyStart}</td><td className="py-2 font-mono">{a.earlyFinish}</td><td className="py-2 font-mono">{a.lateStart}</td><td className="py-2 font-mono">{a.lateFinish}</td><td className="py-2 font-mono">{a.totalFloat}</td><td className="py-2 font-mono">{a.durationDays}</td><td className="py-2">{criticalIds.has(a.id) ? <Badge variant="destructive">{t('scheduling.critical')}</Badge> : <Badge variant="outline">—</Badge>}</td></tr>)}</tbody></table></div>}
          </CardContent>
        </Card>
      )}

      {calendarSchedule && calendarSchedule.calendarAdjusted && (
        <Card>
          <CardHeader>
            <CardTitle>{t('scheduling.calendarAware')} <span className="text-sm font-normal text-muted-foreground">{t('scheduling.workDaysCount', { days: calendarSchedule.workDays ?? '' })}</span></CardTitle>
          </CardHeader>
          <CardContent>
            {calendarSchedule.activities.length === 0 ? <p className="text-sm text-muted-foreground">{t('scheduling.noActivities')}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="pb-2 font-medium">{t('scheduling.colCode')}</th><th className="pb-2 font-medium">{t('scheduling.colName')}</th><th className="pb-2 font-medium">{t('scheduling.colCalendarStart')}</th><th className="pb-2 font-medium">{t('scheduling.colCalendarFinish')}</th></tr></thead><tbody>{calendarSchedule.activities.slice(0, 20).map((a: any) => <tr key={a.id} className="border-b last:border-0"><td className="py-2 font-mono text-xs">{a.code}</td><td className="py-2">{a.name}</td><td className="py-2 font-mono text-xs">{a.calendarStart}</td><td className="py-2 font-mono text-xs">{a.calendarFinish}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-muted-foreground">{t('scheduling.calendarNote')}</p></div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
