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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STORAGE_KEY = 'vetra-forms-builder-draft';

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
  name: string;
  description: string;
  fields: FormField[];
};

const initialDraft: FormDraft = {
  name: 'Daily Site Inspection',
  description: 'Capture site observations, progress, and follow-up actions.',
  fields: [
    { id: 'project', label: 'Project', type: 'select', required: true, options: ['North Tower', 'West Campus', 'River Bridge'] },
    { id: 'inspection-date', label: 'Inspection date', type: 'date', required: true },
    { id: 'observations', label: 'Key observations', type: 'text', required: true, placeholder: 'Describe the current site condition...' },
  ],
};

const fieldTypes: Array<{ type: FieldType; label: string; icon: typeof Type }> = [
  { type: 'text', label: 'Text field', icon: Type },
  { type: 'number', label: 'Number', icon: Hash },
  { type: 'date', label: 'Date', icon: CalendarDays },
  { type: 'select', label: 'Dropdown', icon: List },
  { type: 'checkbox', label: 'Checkbox', icon: ToggleLeft },
];

function makeId() {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createField(type: FieldType): FormField {
  const labels: Record<FieldType, string> = {
    text: 'New text field',
    number: 'New number field',
    date: 'New date field',
    select: 'New dropdown field',
    checkbox: 'New confirmation field',
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
  const [draft, setDraft] = useState<FormDraft>(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as FormDraft) : initialDraft;
    } catch {
      return initialDraft;
    }
  });
  const [selectedId, setSelectedId] = useState(draft.fields[0]?.id ?? '');
  const [mode, setMode] = useState<'build' | 'preview'>('build');
  const [saved, setSaved] = useState(false);

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

  const saveDraft = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Forms workspace
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Forms Builder</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">Create reusable field-based forms for inspections, daily reports, approvals, and project workflows.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === 'build' ? 'default' : 'outline'} onClick={() => setMode('build')} className="gap-2"><Settings2 className="h-4 w-4" /> Build</Button>
          <Button variant={mode === 'preview' ? 'default' : 'outline'} onClick={() => setMode('preview')} className="gap-2"><Eye className="h-4 w-4" /> Preview</Button>
          <Button onClick={saveDraft} className="gap-2"><Save className="h-4 w-4" /> {saved ? 'Saved' : 'Save draft'}</Button>
        </div>
      </div>

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
              <Badge variant="secondary" className="shrink-0 gap-1"><LayoutTemplate className="h-3 w-3" /> Draft</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {mode === 'preview' ? (
              <div className="mx-auto max-w-xl space-y-5 rounded-xl border bg-background p-6 shadow-sm">
                <div><h2 className="text-xl font-semibold">{draft.name || 'Untitled form'}</h2><p className="mt-1 text-sm text-muted-foreground">{draft.description}</p></div>
                {draft.fields.map((field) => <PreviewField key={field.id} field={field} />)}
                <Button className="w-full">Submit form</Button>
              </div>
            ) : (
              <>
                {draft.fields.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Your form is empty. Add a field from the palette to get started.</div>}
                {draft.fields.map((field, index) => (
                  <button key={field.id} type="button" onClick={() => setSelectedId(field.id)} className={`group flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${selectedField?.id === field.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 hover:border-primary/40'}`}>
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60" />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-primary"><FieldIcon type={field.type} /></span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 font-medium">{field.label || 'Untitled field'} {field.required && <span className="text-xs text-primary">Required</span>}</span><span className="text-xs capitalize text-muted-foreground">{field.type} response {index + 1}</span></span>
                    <Trash2 onClick={(event) => { event.stopPropagation(); removeField(field.id); }} className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" />
                  </button>
                ))}
                <button type="button" onClick={() => addField('text')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"><Plus className="h-4 w-4" /> Add field</button>
              </>
            )}
          </CardContent>
        </Card>

        {mode === 'build' && <Card className="h-fit border-border/70 bg-card/80">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Field settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedField ? <p className="text-sm text-muted-foreground">Select a field to edit its settings.</p> : <>
              <div className="space-y-2"><Label htmlFor="field-label">Label</Label><Input id="field-label" value={selectedField.label} onChange={(event) => updateField({ label: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="field-type">Field type</Label><select id="field-type" value={selectedField.type} onChange={(event) => updateField({ type: event.target.value as FieldType })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select></div>
              {selectedField.type === 'text' && <div className="space-y-2"><Label htmlFor="field-placeholder">Placeholder</Label><Input id="field-placeholder" value={selectedField.placeholder ?? ''} onChange={(event) => updateField({ placeholder: event.target.value })} /></div>}
              {selectedField.type === 'select' && <div className="space-y-2"><Label htmlFor="field-options">Options</Label><Textarea id="field-options" value={(selectedField.options ?? []).join('\n')} onChange={(event) => updateField({ options: event.target.value.split('\n').filter(Boolean) })} className="min-h-20" /><p className="text-xs text-muted-foreground">One option per line.</p></div>}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selectedField.required} onChange={(event) => updateField({ required: event.target.checked })} className="h-4 w-4 accent-primary" /><span className="flex-1">Required field</span>{selectedField.required && <Check className="h-4 w-4 text-primary" />}</label>
            </>}
          </CardContent>
        </Card>}
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: FormField }) {
  const label = <Label>{field.label}{field.required && <span className="ml-1 text-primary">*</span>}</Label>;
  if (field.type === 'checkbox') return <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" /> {field.label}</label>;
  if (field.type === 'select') return <div className="space-y-2">{label}<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option>Select an option</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select></div>;
  return <div className="space-y-2">{label}{field.type === 'text' ? <Textarea placeholder={field.placeholder} /> : <Input type={field.type} placeholder={field.placeholder} />}</div>;
}
