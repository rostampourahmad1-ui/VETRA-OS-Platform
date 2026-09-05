import { t } from '@/lib/i18n';
import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  GripVertical,
  LayoutTemplate,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  ToggleLeft,
  CalendarDays,
  List,
  Hash,
  Eye,
  Send,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { get, patch, post } from '@/lib/phase2-api';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';

type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

type FormDraft = {
  id?: number;
  name: string;
  description: string;
  fields: FormField[];
  status?: 'draft' | 'published' | 'archived';
  projectId?: number | null;
  workflowId?: number | null;
};

type FormTemplateResponse = {
  id: number;
  name: string;
  description: string | null;
  definition: { fields: FormField[] };
  status: 'draft' | 'published' | 'archived';
  projectId: number | null;
  workflowId: number | null;
};

type FormSubmissionResponse = {
  id: number;
  projectId: number | null;
  templateId: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';
  answers: Record<string, unknown>;
  workflowRunId: number | null;
  submittedAt: string | null;
  updatedAt: string;
};

function toDraft(template: FormTemplateResponse): FormDraft {
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    fields: template.definition.fields,
    status: template.status,
    projectId: template.projectId,
    workflowId: template.workflowId,
  };
}

const initialDraft: FormDraft = {
  name: t('forms.dailyInspectionName'),
  description: t('forms.dailyInspectionDesc'),
  fields: [
    { id: 'project', label: 'Project', type: 'select', required: true, options: ['North Tower', 'West Campus', 'River Bridge'] },
    { id: 'inspection-date', label: 'Inspection date', type: 'date', required: true },
    { id: 'observations', label: 'Key observations', type: 'text', required: true, placeholder: 'Describe the current site condition...' },
  ],
};

const fieldTypes: Array<{ type: FieldType; label: string; icon: typeof Type }> = [
  { type: 'text', label: t('forms.fieldText'), icon: Type },
  { type: 'number', label: t('forms.fieldNumber'), icon: Hash },
  { type: 'date', label: t('forms.fieldDate'), icon: CalendarDays },
  { type: 'select', label: t('forms.fieldSelect'), icon: List },
  { type: 'checkbox', label: t('forms.approve'), icon: ToggleLeft },
];

function makeId() {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createField(type: FieldType): FormField {
  const labels: Record<FieldType, string> = {
    text: t('forms.newText'),
    number: t('forms.newNumber'),
    date: t('forms.newDate'),
    select: t('forms.newSelect'),
    checkbox: t('forms.newCheckbox'),
  };
  return {
    id: makeId(),
    label: labels[type],
    type,
    required: false,
    placeholder: type === 'text' ? 'Enter a response...' : undefined,
    options: type === 'select' ? ['Option 1', 'Option 2'] : undefined,
  };
}

function FieldIcon({ type }: { type: FieldType }) {
  const Icon = fieldTypes.find((item) => item.type === type)?.icon ?? Type;
  return <Icon className="h-4 w-4" />;
}

export default function FormsBuilder() {
  const [draft, setDraft] = useState<FormDraft>(initialDraft);
  const [selectedId, setSelectedId] = useState(draft.fields[0]?.id ?? '');
  const [mode, setMode] = useState<'build' | 'preview'>('build');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<FormTemplateResponse[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionResponse[]>([]);
  const [selectedSubmissionTemplateId, setSelectedSubmissionTemplateId] = useState('');
  const [submissionAnswers, setSubmissionAnswers] = useState<Record<string, unknown>>({});
  const [submissionBusy, setSubmissionBusy] = useState<number | 'new' | null>(null);
  const { project } = useOrganizationProject();

  const selectedField = useMemo(
    () => draft.fields.find((field) => field.id === selectedId) ?? draft.fields[0],
    [draft.fields, selectedId],
  );

  useEffect(() => {
    if (!selectedField && draft.fields[0]) setSelectedId(draft.fields[0].id);
  }, [draft.fields, selectedField]);

  const updateDraft = (patch: Partial<FormDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const updateField = (patch: Partial<FormField>) => {
    if (!selectedField) return;
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => field.id === selectedField.id ? { ...field, ...patch } : field),
    }));
  };

  const addField = (type: FieldType) => {
    const field = createField(type);
    setDraft((current) => ({ ...current, fields: [...current.fields, field] }));
    setSelectedId(field.id);
    setMode('build');
  };

  const removeField = (id: string) => {
    const fields = draft.fields.filter((field) => field.id !== id);
    setDraft((current) => ({ ...current, fields }));
    setSelectedId(fields[0]?.id ?? '');
  };

  useEffect(() => {
    let active = true;
    void Promise.all([
      get<FormTemplateResponse[]>('/forms/templates', { projectId: project?.id }),
      get<FormSubmissionResponse[]>('/form-submissions', { projectId: project?.id }),
    ])
      .then(([templateRows, submissionRows]) => {
        const template = templateRows.find((item) => item.status === 'draft') ?? templateRows[0];
        if (active) {
          setTemplates(templateRows);
          setSubmissions(submissionRows);
          if (template) setDraft(toDraft(template));
          const published = templateRows.find((item) => item.status === 'published');
          if (published) setSelectedSubmissionTemplateId(String(published.id));
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load forms.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [project?.id]);

  const saveDraft = async () => {
    setSaving(true);
    setError('');
    const payload = { name: draft.name, description: draft.description || undefined, definition: { fields: draft.fields }, projectId: project?.id };
    try {
      if (!project) {
        setError(t('forms.noProjectError'));
        return;
      }
      const saved = draft.id
        ? await patch<FormTemplateResponse>(`/forms/templates/${draft.id}`, payload)
        : await post<FormTemplateResponse>('/forms/templates', payload);
      setDraft(toDraft(saved));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save form draft.');
    } finally {
      setSaving(false);
    }
  };

  const refreshSubmissions = async () => {
    if (!project) return;
    const rows = await get<FormSubmissionResponse[]>('/form-submissions', { projectId: project.id });
    setSubmissions(rows);
  };

  const selectedSubmissionTemplate = templates.find((template) => String(template.id) === selectedSubmissionTemplateId && template.status === 'published');

  const createSubmission = async () => {
    if (!selectedSubmissionTemplate || !project) return;
    setSubmissionBusy('new');
    setError('');
    try {
      const created = await post<FormSubmissionResponse>('/form-submissions', {
        templateId: selectedSubmissionTemplate.id,
        answers: submissionAnswers,
      });
      await post<FormSubmissionResponse>(`/form-submissions/${created.id}/submit`, {});
      setSubmissionAnswers({});
      await refreshSubmissions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('forms.submitError'));
    } finally {
      setSubmissionBusy(null);
    }
  };

  const decideSubmission = async (submission: FormSubmissionResponse, decision: 'approve' | 'reject' | 'request_revision') => {
    if (!submission.workflowRunId) return;
    const comment = decision === 'request_revision' ? window.prompt(t('forms.revisionPrompt'))?.trim() : undefined;
    if (decision === 'request_revision' && !comment) return;
    setSubmissionBusy(submission.id);
    setError('');
    try {
      await post(`/workflow-runs/${submission.workflowRunId}/decision`, { decision, comment });
      await refreshSubmissions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('forms.workflowError'));
    } finally {
      setSubmissionBusy(null);
    }
  };

  const publishDraft = async () => {
    if (!draft.id) return;
    setSaving(true);
    setError('');
    try {
      const result = await post<{ template: FormTemplateResponse }>(`/forms/templates/${draft.id}/publish`, {});
      setDraft(toDraft(result.template));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to publish form.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl" lang="fa" className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {t('forms.workspace')}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t('forms.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('forms.desc')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === 'build' ? 'default' : 'outline'} onClick={() => setMode('build')} className="gap-2"><Settings2 className="h-4 w-4" /> {t('forms.build')}</Button>
          <Button variant={mode === 'preview' ? 'default' : 'outline'} onClick={() => setMode('preview')} className="gap-2"><Eye className="h-4 w-4" /> {t('forms.preview')}</Button>
          <Button disabled={saving || loading} onClick={() => void saveDraft()} className="gap-2"><Save className="h-4 w-4" /> {saving ? t('forms.saving') : t('forms.saveDraft')}</Button>
          {draft.id && draft.status === 'draft' && <Button disabled={saving || loading} variant="outline" onClick={() => void publishDraft()}>{t('forms.publish')}</Button>}
        </div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {loading && <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{t('forms.loadingTemplates')}</div>}

      <Card className="border-border/70 bg-card/80">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-primary" /> {t('forms.submitTitle')}</CardTitle><p className="text-sm text-muted-foreground">{t('forms.submitDesc')}</p></CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2"><Label htmlFor="submission-template">{t('forms.publishedTemplate')}</Label><select id="submission-template" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedSubmissionTemplateId} onChange={(event) => { setSelectedSubmissionTemplateId(event.target.value); setSubmissionAnswers({}); }}><option value="">{t('forms.selectTemplate')}</option>{templates.filter((template) => template.status === 'published').map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></div>
            {selectedSubmissionTemplate?.definition.fields.map((field) => <div key={field.id} className="space-y-2"><Label>{field.label}{field.required && <span className="text-primary"> *</span>}</Label>{field.type === 'checkbox' ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={submissionAnswers[field.id] === true} onChange={(event) => setSubmissionAnswers((current) => ({ ...current, [field.id]: event.target.checked }))} className="h-4 w-4 accent-primary" /> {t('forms.approve')}</label> : field.type === 'select' ? <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={String(submissionAnswers[field.id] ?? '')} onChange={(event) => setSubmissionAnswers((current) => ({ ...current, [field.id]: event.target.value }))}><option value="">{t('forms.selectOption')}</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <Input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} placeholder={field.placeholder} value={String(submissionAnswers[field.id] ?? '')} onChange={(event) => setSubmissionAnswers((current) => ({ ...current, [field.id]: field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}</div>)}
            <Button disabled={!selectedSubmissionTemplate || submissionBusy === 'new'} onClick={() => void createSubmission()} className="gap-2"><Send className="h-4 w-4" />{submissionBusy === 'new' ? t('forms.sending') : t('forms.submitForApproval')}</Button>
          </div>
          <div className="space-y-3">
            {submissions.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('forms.noSubmissions')}</div> : submissions.map((submission) => {
              const template = templates.find((item) => item.id === submission.templateId);
              const pending = submission.status === 'submitted' && submission.workflowRunId;
              return <div key={submission.id} className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{template?.name ?? `Submission #${submission.id}`}</p><p className="text-xs text-muted-foreground">#{submission.id} · {submission.status}</p></div><Badge variant={submission.status === 'approved' ? 'default' : 'secondary'}>{submission.status}</Badge></div>{pending && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={submissionBusy === submission.id} onClick={() => void decideSubmission(submission, 'approve')} className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {t('forms.approve')}</Button><Button size="sm" variant="outline" disabled={submissionBusy === submission.id} onClick={() => void decideSubmission(submission, 'request_revision')} className="gap-1"><RotateCcw className="h-3.5 w-3.5" /> {t('forms.requestRevision')}</Button><Button size="sm" variant="destructive" disabled={submissionBusy === submission.id} onClick={() => void decideSubmission(submission, 'reject')} className="gap-1"><XCircle className="h-3.5 w-3.5" /> {t('forms.reject')}</Button></div>}</div>;
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {mode === 'build' && (
          <Card className="h-fit border-border/70 bg-card/80">
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> Field palette</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {fieldTypes.map(({ type, label, icon: Icon }) => (
                <button key={type} type="button" onClick={() => addField(type)} className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-primary"><Icon className="h-4 w-4" /></span>
                  <span>{label}</span>
                  <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">Tip: start with a small form, then reuse it as the basis for Quality and HSE checklists.</div>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 border-border/70 bg-card/80">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} className="h-9 max-w-lg border-0 bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0" aria-label="Form name" />
                <Textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} className="min-h-12 max-w-xl resize-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0" aria-label="Form description" />
              </div>
              <Badge variant="secondary" className="shrink-0 gap-1"><LayoutTemplate className="h-3 w-3" /> {draft.status ?? 'draft'}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {mode === 'preview' ? (
              <div className="mx-auto max-w-xl space-y-5 rounded-xl border bg-background p-6 shadow-sm">
                <div><h2 className="text-xl font-semibold">{draft.name || 'Untitled form'}</h2><p className="mt-1 text-sm text-muted-foreground">{draft.description}</p></div>
                {draft.fields.map((field) => <PreviewField key={field.id} field={field} />)}
                <Button className="w-full">{t('forms.submitForm')}</Button>
              </div>
            ) : (
              <>
                {draft.fields.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t('forms.yourFormIsEmpty')}</div>}
                {draft.fields.map((field, index) => (
                  <button key={field.id} type="button" onClick={() => setSelectedId(field.id)} className={`group flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${selectedField?.id === field.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 hover:border-primary/40'}`}>
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><FieldIcon type={field.type} /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium">{field.label || t('forms.untitledField')} {field.required && <span className="text-xs text-primary">{t('forms.fieldRequiredBadge')}</span>}</span><span className="text-xs capitalize text-muted-foreground">{t('forms.responseType', {type: field.type})} {index + 1}</span></span>
                    <Trash2 onClick={(event) => { event.stopPropagation(); removeField(field.id); }} className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" />
                  </button>
                ))}
                <button type="button" onClick={() => addField('text')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"><Plus className="h-4 w-4" />{t('forms.addField')}</button>
              </>
            )}
          </CardContent>
        </Card>

        {mode === 'build' && <Card className="h-fit border-border/70 bg-card/80">
          <CardHeader className="pb-3"><CardTitle className="text-sm">{t('forms.fieldSettings')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedField ? <p className="text-sm text-muted-foreground">{t('forms.selectFieldToEdit')}</p> : <>
              <div className="space-y-2"><Label htmlFor="field-label">{t('forms.label')}</Label><Input id="field-label" value={selectedField.label} onChange={(event) => updateField({ label: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="field-type">{t('forms.fieldType')}</Label><select id="field-type" value={selectedField.type} onChange={(event) => updateField({ type: event.target.value as FieldType })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="text">{t('forms.fieldText')}</option><option value="number">{t('forms.fieldNumber')}</option><option value="date">{t('forms.fieldDate')}</option><option value="select">{t('forms.fieldSelect')}</option><option value="checkbox">{t('forms.fieldCheckbox')}</option></select></div>
              {selectedField.type === 'text' && <div className="space-y-2"><Label htmlFor="field-placeholder">{t('forms.placeholder')}</Label><Input id="field-placeholder" value={selectedField.placeholder ?? ''} onChange={(event) => updateField({ placeholder: event.target.value })} /></div>}
              {selectedField.type === 'select' && <div className="space-y-2"><Label htmlFor="field-options">{t('forms.options')}</Label><Textarea id="field-options" value={(selectedField.options ?? []).join('\n')} onChange={(event) => updateField({ options: event.target.value.split('\n').filter(Boolean) })} className="min-h-20" /><p className="text-xs text-muted-foreground">{t('forms.oneOptionPerLine')}</p></div>}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selectedField.required} onChange={(event) => updateField({ required: event.target.checked })} className="h-4 w-4 accent-primary" /><span className="flex-1">{t('forms.requiredField')}</span>{selectedField.required && <Check className="h-4 w-4 text-primary" />}</label>
            </>}
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: FormField }) {
  const label = <Label>{field.label}{field.required && <span className="mr-1 text-primary">*</span>}</Label>;
  if (field.type === 'checkbox') return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" /> {field.label}</label>;
  if (field.type === 'select') return <div className="space-y-2">{label}<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>{t('forms.selectOption')}</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></div>;
  return <div className="space-y-2">{label}{field.type === 'text' ? <Textarea placeholder={field.placeholder} /> : <Input type={field.type} placeholder={field.placeholder} />}</div>;
}
