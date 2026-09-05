import { t } from '@/lib/i18n';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileWarning, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { apiRequest, get, post } from '@/lib/phase2-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';
import { formatJalali } from '@/lib/jalali';

interface Inspection {
  id: number;
  projectId: number;
  title: string;
  type: string;
  status: string;
  inspector: string;
  date: string;
  findings?: string | null;
  templateId?: number | null;
}

interface FormTemplate {
  id: number;
  name: string;
  status: string;
  projectId?: number | null;
}

interface Ncr {
  id: number;
  projectId: number;
  title: string;
  severity: string;
  status: string;
  description: string;
  correctiveAction?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
}

const inspectionStatuses = ['planned', 'in_progress', 'completed', 'cancelled'];
const ncrStatuses = ['open', 'in_progress', 'resolved', 'closed'];

const statusTone = (status: string) => {
  if (['completed', 'resolved', 'closed'].includes(status)) return 'default';
  if (['cancelled'].includes(status)) return 'destructive';
  return 'secondary';
};

export default function QualityManagement() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [ncrs, setNcrs] = useState<Ncr[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const { project } = useOrganizationProject();
  const [inspectionFilter, setInspectionFilter] = useState('all');
  const [ncrFilter, setNcrFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const [inspectionForm, setInspectionForm] = useState({ projectId: '', templateId: '', title: '', type: 'routine', status: 'planned', inspector: '', date: '', findings: '' });
  const [ncrForm, setNcrForm] = useState({ projectId: '', title: '', severity: 'medium', status: 'open', description: '', correctiveAction: '', assignedTo: '', dueDate: '' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [inspectionRows, ncrRows, templateRows] = await Promise.all([
        get<Inspection[]>('/inspections', { projectId: project?.id }),
        get<Ncr[]>('/non-conformance-reports', { projectId: project?.id }),
        get<FormTemplate[]>('/forms/templates', { projectId: project?.id, status: 'published' }),
      ]);
      setInspections(inspectionRows);
      setNcrs(ncrRows);
      setTemplates(templateRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load quality records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [project?.id]);

  const visibleInspections = useMemo(() => inspectionFilter === 'all' ? inspections : inspections.filter((item) => item.status === inspectionFilter), [inspections, inspectionFilter]);
  const visibleNcrs = useMemo(() => ncrFilter === 'all' ? ncrs : ncrs.filter((item) => item.status === ncrFilter), [ncrs, ncrFilter]);

  const createInspection = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!project) return;
      await post<Inspection>('/inspections', { ...inspectionForm, projectId: project.id, templateId: inspectionForm.templateId ? Number(inspectionForm.templateId) : null });
      setInspectionForm({ projectId: '', templateId: '', title: '', type: 'routine', status: 'planned', inspector: '', date: '', findings: '' });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create inspection.'); }
  };

  const createNcr = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (!project) return;
      await post<Ncr>('/non-conformance-reports', { ...ncrForm, projectId: project.id });
      setNcrForm({ projectId: '', title: '', severity: 'medium', status: 'open', description: '', correctiveAction: '', assignedTo: '', dueDate: '' });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create NCR.'); }
  };

  const remove = async (path: string) => {
    try { await apiRequest<void>(path, { method: 'DELETE' }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete record.'); }
  };

  const transition = async (kind: 'inspection' | 'ncr', id: number, status: string) => {
    setTransitioning(id);
    setError('');
    try {
      const path = kind === 'inspection' ? `/inspections/${id}/transition` : `/non-conformance-reports/${id}/transition`;
      await post(path, { status });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('quality.errorTransition'));
    } finally {
      setTransitioning(null);
    }
  };

  const nextInspectionStatus: Record<string, string | undefined> = { planned: 'in_progress', in_progress: 'completed' };
  const nextNcrStatus: Record<string, string | undefined> = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PROJECT CONTROL / QUALITY</p>
          <h1 className="text-3xl font-semibold tracking-tight">Quality Management</h1>
          <p className="mt-1 text-muted-foreground">Track inspections, findings, and non-conformance corrective actions across projects.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('quality.inspections')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{inspections.length}</p><p className="text-xs text-muted-foreground">{inspections.filter((item) => item.status === 'completed').length} {t('quality.completed')}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('quality.ncrs')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{ncrs.length}</p><p className="text-xs text-muted-foreground">{ncrs.filter((item) => !['closed', 'resolved'].includes(item.status)).length} {t('quality.open')}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('quality.formTemplates')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{templates.length}</p><p className="text-xs text-muted-foreground">{t('quality.published')}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{t('quality.completionRate')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{inspections.length ? Math.round((inspections.filter((item) => item.status === 'completed').length / inspections.length) * 100) : 0}%</p><p className="text-xs text-muted-foreground">{t('quality.basedOnInspections')}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />New inspection</CardTitle></CardHeader>
          <CardContent><form className="grid gap-3" onSubmit={createInspection}>
            <div className="grid gap-3 sm:grid-cols-2"><Input required type="number" min="1" aria-label="{t('quality.activeProject')}" value={project?.id ?? ''} readOnly /><select className="h-10 rounded-md border bg-background px-3 text-sm" aria-label={t('quality.formTemplates')} value={inspectionForm.templateId} onChange={(e) => setInspectionForm({ ...inspectionForm, templateId: e.target.value })}><option value="">{t('forms.noTemplate')}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div><div className="grid gap-3 sm:grid-cols-2"><Input required placeholder={t('quality.submitInspection')} value={inspectionForm.title} onChange={(e) => setInspectionForm({ ...inspectionForm, title: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-3"><Input required placeholder="Inspector" value={inspectionForm.inspector} onChange={(e) => setInspectionForm({ ...inspectionForm, inspector: e.target.value })} /><Input required type="date" value={inspectionForm.date} onChange={(e) => setInspectionForm({ ...inspectionForm, date: e.target.value })} /><select className="h-10 rounded-md border bg-background px-3 text-sm" value={inspectionForm.type} onChange={(e) => setInspectionForm({ ...inspectionForm, type: e.target.value })}><option value="routine">Routine</option><option value="material">Material</option><option value="site">Site</option><option value="final">Final</option></select></div>
            <Textarea placeholder="Findings" value={inspectionForm.findings} onChange={(e) => setInspectionForm({ ...inspectionForm, findings: e.target.value })} />
            <Button type="submit"><ClipboardCheck className="mr-2 h-4 w-4" />Create inspection</Button>
          </form></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />New non-conformance report</CardTitle></CardHeader>
          <CardContent><form className="grid gap-3" onSubmit={createNcr}>
            <div className="grid gap-3 sm:grid-cols-2"><Input required type="number" min="1" aria-label="{t('quality.activeProject')}" value={project?.id ?? ''} readOnly /><Input required placeholder="NCR title" value={ncrForm.title} onChange={(e) => setNcrForm({ ...ncrForm, title: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={ncrForm.severity} onChange={(e) => setNcrForm({ ...ncrForm, severity: e.target.value })}><option value="low">{t('quality.severityLow')}</option><option value="medium">{t('quality.severityMedium')}</option><option value="high">{t('quality.severityHigh')}</option><option value="critical">{t('quality.severityCritical')}</option></select><Input placeholder={t('quality.assignedTo')} value={ncrForm.assignedTo} onChange={(e) => setNcrForm({ ...ncrForm, assignedTo: e.target.value })} /><Input type="date" value={ncrForm.dueDate} onChange={(e) => setNcrForm({ ...ncrForm, dueDate: e.target.value })} /></div>
            <Textarea required placeholder="Description" value={ncrForm.description} onChange={(e) => setNcrForm({ ...ncrForm, description: e.target.value })} /><Textarea placeholder={t('quality.correctiveAction')} value={ncrForm.correctiveAction} onChange={(e) => setNcrForm({ ...ncrForm, correctiveAction: e.target.value })} />
            <Button type="submit"><FileWarning className="mr-2 h-4 w-4" />{t('quality.submitNcr')}</Button>
          </form></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{t('quality.inspections')} <span className="text-sm font-normal text-muted-foreground">({visibleInspections.length})</span></CardTitle><select className="h-9 rounded-md border bg-background px-2 text-sm" value={inspectionFilter} onChange={(e) => setInspectionFilter(e.target.value)}><option value="all">{t('quality.allStatuses')}</option>{inspectionStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div></CardHeader><CardContent>{loading ? <p className="text-sm text-muted-foreground">{t('quality.loading')}</p> : visibleInspections.length === 0 ? <p className="text-sm text-muted-foreground">{t('quality.noInspectionsFilter')}</p> : <div className="space-y-3">{visibleInspections.map((item) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.title}</h3><p className="text-sm text-muted-foreground">{t('quality.projectPrefix', {id: item.projectId})} · {item.type} · {item.inspector}</p></div><div className="flex items-center gap-2"><Badge variant={statusTone(item.status)}>{item.status.replace('_', ' ')}</Badge>{nextInspectionStatus[item.status] && <Button variant="outline" size="sm" disabled={transitioning === item.id} onClick={() => void transition('inspection', item.id, nextInspectionStatus[item.status] ?? '')}>{t('quality.changeTo')} {nextInspectionStatus[item.status]}</Button>}<Button variant="ghost" size="icon" aria-label={t('quality.deleteInspection')} onClick={() => void remove(`/inspections/${item.id}`)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div><p className="mt-2 text-sm">{t('quality.inspectionDateLabel', {date: formatJalali(item.date)})}</p>{item.findings && <p className="mt-1 text-sm text-muted-foreground">{item.findings}</p>}</div>)}</div>}</CardContent></Card>

        <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{t('quality.ncrs')} <span className="text-sm font-normal text-muted-foreground">({visibleNcrs.length})</span></CardTitle><select className="h-9 rounded-md border bg-background px-2 text-sm" value={ncrFilter} onChange={(e) => setNcrFilter(e.target.value)}><option value="all">{t('quality.allStatuses')}</option>{ncrStatuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div></CardHeader><CardContent>{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : visibleNcrs.length === 0 ? <p className="text-sm text-muted-foreground">{t('quality.noNcrsFilter')}</p> : <div className="space-y-3">{visibleNcrs.map((item) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.title}</h3><p className="text-sm text-muted-foreground">Project #{item.projectId} · {item.assignedTo ? t('quality.assignedToLabel', {name: item.assignedTo}) : '—'}</p></div><div className="flex items-center gap-2"><Badge variant={item.severity === 'critical' ? 'destructive' : 'secondary'}>{item.severity}</Badge>{nextNcrStatus[item.status] && <Button variant="outline" size="sm" disabled={transitioning === item.id} onClick={() => void transition('ncr', item.id, nextNcrStatus[item.status] ?? '')}>{t('quality.changeTo')} {nextNcrStatus[item.status]}</Button>}<Button variant="ghost" size="icon" aria-label={t('quality.deleteNcr')} onClick={() => void remove(`/non-conformance-reports/${item.id}`)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div><p className="mt-2 text-sm">{item.description}</p>{item.correctiveAction && <p className="mt-1 text-sm text-muted-foreground">{t('quality.correctiveActionLabel', {action: item.correctiveAction})}</p>}<div className="mt-2 flex gap-2 text-xs text-muted-foreground"><Badge variant={statusTone(item.status)}>{item.status.replace('_', ' ')}</Badge>{item.dueDate && <span>{t('quality.dueLabel', {date: formatJalali(item.dueDate)})}</span>}</div></div>)}</div>}</CardContent></Card>
      </div>
    </div>
  );
}
