import React, { useState } from 'react';
import { useListDailyReports, useCreateDailyReport, getListDailyReportsQueryKey } from '@workspace/api-client-react';
import { Plus, Users, CloudRain, Sun, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import { formatJalali } from '@/lib/jalali';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';
import { get, patch, apiRequest } from '@/lib/phase2-api';
import { useQueryClient } from '@tanstack/react-query';

export default function DailyReportList() {
  const { data: reports, isLoading } = useListDailyReports();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ date: '', weather: 'clear', temperature: '', progress: '0', workersOnSite: '0', issues: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { project } = useOrganizationProject();
  const queryClient = useQueryClient();
  const createMutation = useCreateDailyReport();

  const openCreate = () => {
    setEditId(null);
    setForm({ date: new Date().toISOString().split('T')[0], weather: 'clear', temperature: '', progress: '0', workersOnSite: '0', issues: '', notes: '' });
    setError(''); setDialogOpen(true);
  };

  const openEdit = (report: any) => {
    setEditId(report.id);
    setForm({ date: report.date, weather: report.weather, temperature: report.temperature?.toString() ?? '', progress: report.progress.toString(), workersOnSite: (report.workersOnSite ?? 0).toString(), issues: report.issues ?? '', notes: report.notes ?? '' });
    setError(''); setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id && !editId) { setError('Please select a project first.'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = { date: form.date, weather: form.weather, temperature: form.temperature ? Number(form.temperature) : undefined, progress: Number(form.progress), workersOnSite: Number(form.workersOnSite), issues: form.issues || undefined, notes: form.notes || undefined };
      if (editId) {
        await apiRequest(`/daily-reports/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await createMutation.mutateAsync({ data: { ...payload, projectId: project!.id } });
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
    } catch (cause: any) { setError(cause?.message ?? 'Failed to save report.'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this daily report?')) return;
    try {
      await apiRequest(`/daily-reports/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
    } catch (cause: any) { setError(cause?.message ?? 'Failed to delete report.'); }
  };

  const getWeatherIcon = (weather: string) => {
    const w = weather.toLowerCase();
    if (w.includes('rain')) return <CloudRain className="h-4 w-4 text-blue-400" />;
    if (w.includes('sun') || w.includes('clear')) return <Sun className="h-4 w-4 text-amber-500" />;
    return <CloudRain className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Site Reports</h1>
          <p className="text-muted-foreground">Track daily site progress, weather, and issues.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Log Report
        </Button>
      </div>

      {error && <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-lg text-sm">{error}</div>}

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center font-mono text-muted-foreground">LOADING REPORTS...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Project</th>
                  <th className="py-3 px-4 font-medium">Weather</th>
                  <th className="py-3 px-4 font-medium">Workforce</th>
                  <th className="py-3 px-4 font-medium">Progress</th>
                  <th className="py-3 px-4 font-medium">Reported By</th>
                  <th className="py-3 px-4 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports?.map((report: any) => (
                  <tr key={report.id} className="group hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-medium font-mono text-xs">{formatJalali(report.date)}</td>
                    <td className="py-3 px-4">
                      <Link href={`/projects/${report.projectId}`} className="text-primary hover:underline font-medium">{report.projectName}</Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getWeatherIcon(report.weather)}
                        <span className="capitalize">{report.weather}</span>
                        {report.temperature && <span>({report.temperature}°C)</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono">{report.workersOnSite || 0}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${report.progress}%` }} />
                        </div>
                        <span className="font-mono text-xs">{report.progress}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{report.createdBy}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(report)} className="p-1 hover:bg-muted rounded transition-colors"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        <button onClick={() => handleDelete(report.id)} className="p-1 hover:bg-muted rounded transition-colors"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? 'Edit Daily Report' : 'Log Daily Report'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weather">Weather</Label>
              <select id="weather" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={form.weather} onChange={e => setForm(f => ({ ...f, weather: e.target.value }))}>
                <option value="clear">Clear / Sunny</option>
                <option value="cloudy">Cloudy</option>
                <option value="rain">Rain</option>
                <option value="storm">Storm</option>
                <option value="fog">Fog</option>
                <option value="hot">Hot</option>
                <option value="cold">Cold</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temperature">Temperature (°C)</Label>
              <Input id="temperature" type="number" step="0.1" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workersOnSite">Workers on Site</Label>
              <Input id="workersOnSite" type="number" min="0" value={form.workersOnSite} onChange={e => setForm(f => ({ ...f, workersOnSite: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="progress">Progress (%)</Label>
              <Input id="progress" type="number" min="0" max="100" step="0.1" value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value }))} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issues">Issues</Label>
            <textarea id="issues" className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" value={form.issues} onChange={e => setForm(f => ({ ...f, issues: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea id="notes" className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : editId ? 'Update Report' : 'Create Report'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
