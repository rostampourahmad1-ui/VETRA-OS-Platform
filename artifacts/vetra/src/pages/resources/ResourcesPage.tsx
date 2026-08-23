import { FormEvent, useEffect, useState } from 'react';
import { Boxes, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { get, post, apiRequest } from '@/lib/phase2-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ResourceType {
  id: number; name: string; category: string; unit: string; defaultCostPerUnit: string; description?: string | null;
}
interface ResourceAssignment {
  id: number; activityId: number; resourceTypeId: number; quantity: string; costPerUnit: string; totalCost: string; startDate?: string | null; endDate?: string | null; notes?: string | null;
}

export default function ResourcesPage() {
  const [types, setTypes] = useState<ResourceType[]>([]);
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
  const [summary, setSummary] = useState<Record<string, { count: number; totalCost: number; types: string[] }>>({});
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rtForm, setRtForm] = useState({ name: '', category: 'labor', unit: '', defaultCostPerUnit: '0', description: '' });
  const [raForm, setRaForm] = useState({ activityId: '', resourceTypeId: '', quantity: '1', costPerUnit: '0', totalCost: '0', notes: '' });

  const loadTypes = async () => {
    try { const data = await get<ResourceType[]>('/resource-types'); setTypes(data); }
    catch { /* ignore */ }
  };

  const loadAssignments = async (pid: string) => {
    if (!pid) { setAssignments([]); setSummary({}); return; }
    try {
      const [data, sum] = await Promise.all([
        get<ResourceAssignment[]>(`/projects/${pid}/resource-assignments`).catch(() => []),
        get<Record<string, { count: number; totalCost: number; types: string[] }>>(`/projects/${pid}/resource-summary`).catch(() => ({})),
      ]);
      setAssignments(data); setSummary(sum);
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadTypes(); }, []);
  useEffect(() => { void loadAssignments(projectId); }, [projectId]);

  const createType = async (e: FormEvent) => {
    e.preventDefault();
    try { await post('/resource-types', rtForm); setRtForm({ name: '', category: 'labor', unit: '', defaultCostPerUnit: '0', description: '' }); await loadTypes(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create resource type.'); }
  };

  const assignResource = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/resource-assignments`, { ...raForm, activityId: Number(raForm.activityId), resourceTypeId: Number(raForm.resourceTypeId) }); setRaForm({ activityId: '', resourceTypeId: '', quantity: '1', costPerUnit: '0', totalCost: '0', notes: '' }); await loadAssignments(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to assign resource.'); }
  };

  const removeType = async (id: number) => { try { await apiRequest(`/resource-types/${id}`, { method: 'DELETE' }); await loadTypes(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } };
  const removeAssignment = async (id: number) => { try { await apiRequest(`/resource-assignments/${id}`, { method: 'DELETE' }); if (projectId) await loadAssignments(projectId); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete.'); } };

  const categoryBadge = (cat: string) => {
    const colors: Record<string, string> = { labor: 'default', equipment: 'secondary', material: 'outline' };
    return <Badge variant={colors[cat] as any}>{cat}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">PROJECT CONTROL / RESOURCES</p>
          <h1 className="text-3xl font-semibold tracking-tight">Resources & Tasks</h1>
          <p className="mt-1 text-muted-foreground">Manage resource types and assign resources to activities.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="number" min="1" placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-32" />
          <Button variant="outline" onClick={() => { loadTypes(); projectId && loadAssignments(projectId); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {Object.keys(summary).length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(summary).map(([cat, data]) => (
            <Card key={cat}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">{categoryBadge(cat)}</div>
                <p className="text-2xl font-semibold">{data.count}</p>
                <p className="text-xs text-muted-foreground">Assignments · {data.totalCost.toLocaleString()} total cost</p>
                <p className="text-xs text-muted-foreground mt-1">{data.types.join(', ')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" />New resource type</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createType}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required placeholder="Name" value={rtForm.name} onChange={(e) => setRtForm({ ...rtForm, name: e.target.value })} />
                <Input required placeholder="Unit (e.g. hrs, kg, m3)" value={rtForm.unit} onChange={(e) => setRtForm({ ...rtForm, unit: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="h-10 rounded-md border bg-background px-3 text-sm" value={rtForm.category} onChange={(e) => setRtForm({ ...rtForm, category: e.target.value })}>
                  <option value="labor">Labor</option><option value="equipment">Equipment</option><option value="material">Material</option>
                </select>
                <Input placeholder="Default cost per unit" value={rtForm.defaultCostPerUnit} onChange={(e) => setRtForm({ ...rtForm, defaultCostPerUnit: e.target.value })} />
              </div>
              <Input placeholder="Description" value={rtForm.description} onChange={(e) => setRtForm({ ...rtForm, description: e.target.value })} />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Create resource type</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Assign resource to activity</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={assignResource}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input required type="number" min="1" placeholder="Activity ID" value={raForm.activityId} onChange={(e) => setRaForm({ ...raForm, activityId: e.target.value })} />
                <Input required type="number" min="1" placeholder="Resource type ID" value={raForm.resourceTypeId} onChange={(e) => setRaForm({ ...raForm, resourceTypeId: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Quantity" value={raForm.quantity} onChange={(e) => setRaForm({ ...raForm, quantity: e.target.value })} />
                <Input placeholder="Cost per unit" value={raForm.costPerUnit} onChange={(e) => setRaForm({ ...raForm, costPerUnit: e.target.value })} />
                <Input placeholder="Total cost" value={raForm.totalCost} onChange={(e) => setRaForm({ ...raForm, totalCost: e.target.value })} />
              </div>
              <Input placeholder="Notes" value={raForm.notes} onChange={(e) => setRaForm({ ...raForm, notes: e.target.value })} />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Assign resource</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Resource Types <span className="text-sm font-normal text-muted-foreground">({types.length})</span></CardTitle></CardHeader>
          <CardContent>
            {types.length === 0 ? <p className="text-sm text-muted-foreground">No resource types defined.</p> : <div className="space-y-3">{types.map((rt) => <div key={rt.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{rt.name}</h3><p className="text-sm text-muted-foreground">{rt.unit} · {rt.defaultCostPerUnit} per unit</p></div><div className="flex items-center gap-2">{categoryBadge(rt.category)}<Button variant="ghost" size="icon" onClick={() => removeType(rt.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>{rt.description && <p className="mt-1 text-xs text-muted-foreground">{rt.description}</p>}</div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Resource Assignments <span className="text-sm font-normal text-muted-foreground">({assignments.length})</span></CardTitle></CardHeader>
          <CardContent>
            {!projectId ? <p className="text-sm text-muted-foreground">Enter a project ID to load assignments.</p> : assignments.length === 0 ? <p className="text-sm text-muted-foreground">No resource assignments for this project.</p> : <div className="space-y-3">{assignments.map((ra) => <div key={ra.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">Activity #{ra.activityId} — Resource #{ra.resourceTypeId}</h3><p className="text-xs text-muted-foreground">Qty: {ra.quantity} · Cost: {ra.totalCost}</p></div><Button variant="ghost" size="icon" onClick={() => removeAssignment(ra.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>{ra.notes && <p className="mt-1 text-xs text-muted-foreground">{ra.notes}</p>}</div>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
