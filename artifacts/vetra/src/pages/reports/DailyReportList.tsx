import React, { useState, useCallback } from "react";
import { useListDailyReports, useCreateDailyReport, getListDailyReportsQueryKey } from "@workspace/api-client-react";
import type { DailyReport } from "@workspace/api-client-react";
import { t, type TranslationKey } from "@/lib/i18n";
import { Plus, Users, CloudRain, Sun, Pencil, Trash2, Send, CheckCircle2, XCircle, RotateCcw, History, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatJalali } from "@/lib/jalali";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrganizationProject } from "@/contexts/OrganizationProjectContext";
import { apiRequest } from "@/lib/phase2-api";
import { useQueryClient } from "@tanstack/react-query";

// ─── Status helpers ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "dailyReports.statusDraft",
  submitted: "dailyReports.statusSubmitted",
  in_review: "dailyReports.statusInReview",
  approved: "dailyReports.statusApproved",
  rejected: "dailyReports.statusRejected",
  revision_requested: "dailyReports.statusRevisionRequested",
};

function statusBadge(status: string | undefined) {
  const s = status ?? "draft";
  const colors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground border-muted-foreground/20",
    submitted: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    in_review: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    revision_requested: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  };
  return (
    <Badge variant="outline" className={`border ${colors[s] ?? colors.draft} font-sans text-[10px]`}>
      {t((STATUS_LABELS[s] ?? s) as TranslationKey)}
    </Badge>
  );
}

const WEATHER_OPTIONS = ["clear", "cloudy", "rain", "storm", "fog", "hot", "cold"] as const;

const WEATHER_KEYS: Record<string, TranslationKey> = {
  clear: "dailyReports.weatherClear",
  cloudy: "dailyReports.weatherCloudy",
  rain: "dailyReports.weatherRain",
  storm: "dailyReports.weatherStorm",
  fog: "dailyReports.weatherFog",
  hot: "dailyReports.weatherHot",
  cold: "dailyReports.weatherCold",
};

const ATTENDANCE_KEYS: Record<string, TranslationKey> = {
  present: "dailyReports.attendancePresent",
  absent: "dailyReports.attendanceAbsent",
  late: "dailyReports.attendanceLate",
  on_leave: "dailyReports.attendanceOnLeave",
  half_day: "dailyReports.attendanceHalfDay",
};

const EVENT_KEYS: Record<string, TranslationKey> = {
  submitted: "dailyReports.eventSubmitted",
  approved: "dailyReports.eventApproved",
  rejected: "dailyReports.eventRejected",
  revision_requested: "dailyReports.eventRevision",
};

// ─── Workflow event type ───────────────────────────────────────────────────

interface WorkflowEvent {
  id: number;
  action: string;
  comment?: string | null;
  actorId: number;
  createdAt: string;
  workflowStepId?: number | null;
}

interface WorkforceEntry {
  id: number;
  dailyReportId: number;
  employeeId: number | null;
  groupName: string | null;
  role: string;
  count: number;
  attendanceStatus: string;
  hoursWorked: number;
  notes: string | null;
}

interface WorkforceData {
  entries: WorkforceEntry[];
  aggregation: {
    totalWorkers: number;
    totalHours: number;
    byRole: Array<{ role: string; count: number; hours: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
}

// ─── Main component ────────────────────────────────────────────────────────

export default function DailyReportList() {
  const { project } = useOrganizationProject();
  const queryClient = useQueryClient();

  const { data: reports, isLoading, isError, error: fetchError } = useListDailyReports(
    project?.id ? { projectId: project.id } : undefined,
  );

  const createMutation = useCreateDailyReport();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    date: "",
    weather: "clear" as string,
    temperature: "",
    progress: "0",
    workersOnSite: "0",
    issues: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitTargetId, setSubmitTargetId] = useState<number | null>(null);
  const [workflows, setWorkflows] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);

  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [decisionTargetId, setDecisionTargetId] = useState<number | null>(null);
  const [decisionAction, setDecisionAction] = useState<"approve" | "reject" | "revision_requested">("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);

  const [workforceDialogOpen, setWorkforceDialogOpen] = useState(false);
  const [workforceReportId, setWorkforceReportId] = useState<number | null>(null);
  const [workforceData, setWorkforceData] = useState<WorkforceData | null>(null);
  const [workforceLoading, setWorkforceLoading] = useState(false);
  const [workforceForm, setWorkforceForm] = useState({
    employeeId: "",
    groupName: "",
    role: "",
    count: "1",
    attendanceStatus: "present" as string,
    hoursWorked: "0",
    notes: "",
  });
  const [workforceSubmitting, setWorkforceSubmitting] = useState(false);
  const [workforceError, setWorkforceError] = useState("");

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
  }, [queryClient]);

  const resetForm = () => {
    setEditId(null);
    setForm({
      date: new Date().toISOString().split("T")[0],
      weather: "clear",
      temperature: "",
      progress: "0",
      workersOnSite: "0",
      issues: "",
      notes: "",
    });
    setError("");
  };

  const openCreate = () => {
    if (!project?.id) {
      setError(t('forms.noProjectError'));
      return;
    }
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (report: DailyReport) => {
    setEditId(report.id);
    setForm({
      date: report.date,
      weather: report.weather ?? "clear",
      temperature: report.temperature?.toString() ?? "",
      progress: report.progress.toString(),
      workersOnSite: (report.workersOnSite ?? 0).toString(),
      issues: report.issues ?? "",
      notes: report.notes ?? "",
    });
    setError("");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id && !editId) {
      setError(t('forms.noProjectError'));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        date: form.date,
        weather: form.weather,
        temperature: form.temperature ? Number(form.temperature) : undefined,
        progress: Number(form.progress),
        workersOnSite: Number(form.workersOnSite),
        issues: form.issues || undefined,
        notes: form.notes || undefined,
      };
      if (editId) {
        await apiRequest(`/daily-reports/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await createMutation.mutateAsync({
          data: { ...payload, projectId: project!.id },
        });
      }
      setFormOpen(false);
      invalidate();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('dailyReports.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('dailyReports.deleteConfirm'))) return;
    try {
      await apiRequest(`/daily-reports/${id}`, { method: "DELETE" });
      invalidate();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('dailyReports.deleteFailed'));
    }
  };

  const openSubmit = async (reportId: number) => {
    setSubmitTargetId(reportId);
    setSelectedWorkflowId(null);
    setSubmitDialogOpen(true);
    setWorkflowsLoading(true);
    try {
      const data = await apiRequest<Array<{ id: number; name: string }>>("/workflows?entityType=daily_report");
      setWorkflows(data ?? []);
    } catch {
      setWorkflows([]);
    } finally {
      setWorkflowsLoading(false);
    }
  };

  const handleSubmitToWorkflow = async () => {
    if (!submitTargetId || !selectedWorkflowId) return;
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(`/daily-reports/${submitTargetId}/submit`, {
        method: "POST",
        body: JSON.stringify({ workflowId: selectedWorkflowId }),
      });
      setSubmitDialogOpen(false);
      invalidate();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('dailyReports.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const openEvents = async (reportId: number) => {
    setEventsDialogOpen(true);
    setEventsLoading(true);
    try {
      const data = await apiRequest<WorkflowEvent[]>(`/daily-reports/${reportId}/workflow-events`);
      setEvents(data ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const openDecision = (reportId: number, action: "approve" | "reject" | "revision_requested") => {
    setDecisionTargetId(reportId);
    setDecisionAction(action);
    setDecisionReason("");
    setDecisionDialogOpen(true);
  };

  const handleDecision = async () => {
    if (!decisionTargetId) return;
    setDecisionBusy(true);
    setError("");
    try {
      const statusMap: Record<string, string> = {
        approve: "approved",
        reject: "rejected",
        revision_requested: "revision_requested",
      };
      await apiRequest(`/daily-reports/${decisionTargetId}/transition`, {
        method: "POST",
        body: JSON.stringify({
          status: statusMap[decisionAction],
          reason: decisionReason || undefined,
        }),
      });
      setDecisionDialogOpen(false);
      invalidate();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : t('dailyReports.decisionFailed'));
    } finally {
      setDecisionBusy(false);
    }
  };

  const getWeatherIcon = (weather: string) => {
    const w = weather.toLowerCase();
    if (w.includes("rain")) return <CloudRain className="h-4 w-4 text-blue-400" />;
    if (w.includes("sun") || w.includes("clear")) return <Sun className="h-4 w-4 text-amber-500" />;
    return <CloudRain className="h-4 w-4 text-muted-foreground" />;
  };

  const canEdit = (status: string | undefined) => status === "draft" || status === "revision_requested";
  const canDelete = (status: string | undefined) => status !== "approved";
  const canSubmit = (status: string | undefined) => status === "draft";
  const canDecide = (status: string | undefined) => status === "in_review";

  const fetchWorkforce = async (reportId: number) => {
    setWorkforceLoading(true);
    setWorkforceError("");
    try {
      const data = await apiRequest<WorkforceData>(`/daily-reports/${reportId}/workforce`);
      setWorkforceData(data);
    } catch (cause: unknown) {
      setWorkforceError(cause instanceof Error ? cause.message : t('dailyReports.workforceLoadFailed'));
      setWorkforceData(null);
    } finally {
      setWorkforceLoading(false);
    }
  };

  const openWorkforce = (reportId: number) => {
    setWorkforceReportId(reportId);
    setWorkforceDialogOpen(true);
    resetWorkforceForm();
    fetchWorkforce(reportId);
  };

  const resetWorkforceForm = () => {
    setWorkforceForm({
      employeeId: "",
      groupName: "",
      role: "",
      count: "1",
      attendanceStatus: "present",
      hoursWorked: "0",
      notes: "",
    });
    setWorkforceError("");
  };

  const handleAddWorkforce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workforceReportId) return;
    if (!workforceForm.role.trim()) { setWorkforceError(t('dailyReports.roleRequired')); return; }
    if (!workforceForm.employeeId && !workforceForm.groupName.trim()) {
      setWorkforceError(t('dailyReports.employeeOrGroupRequired'));
      return;
    }
    setWorkforceSubmitting(true);
    setWorkforceError("");
    try {
      await apiRequest(`/daily-reports/${workforceReportId}/workforce`, {
        method: "POST",
        body: JSON.stringify({
          employeeId: workforceForm.employeeId ? Number(workforceForm.employeeId) : null,
          groupName: workforceForm.groupName.trim() || null,
          role: workforceForm.role.trim(),
          count: Number(workforceForm.count),
          attendanceStatus: workforceForm.attendanceStatus,
          hoursWorked: Number(workforceForm.hoursWorked),
          notes: workforceForm.notes.trim() || null,
        }),
      });
      resetWorkforceForm();
      await fetchWorkforce(workforceReportId);
    } catch (cause: unknown) {
      setWorkforceError(cause instanceof Error ? cause.message : t('dailyReports.workforceAddFailed'));
    } finally {
      setWorkforceSubmitting(false);
    }
  };

  const hasReports = reports && reports.length > 0;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('dailyReports.dailySiteReports')}</h1>
            <p className="text-muted-foreground">{t('dailyReports.trackDaily')}</p>
          </div>
          <Button className="shrink-0 gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('dailyReports.logReport')}
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('dailyReports.loading')}
            </div>
          ) : isError ? (
            <div className="py-20 text-center text-destructive">
              {(fetchError as Error)?.message ?? t('dailyReports.loadFailed')}
            </div>
          ) : !hasReports ? (
            <div className="py-20 text-center text-muted-foreground">
              {project ? t('dailyReports.noReports') : t('dailyReports.selectProject')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-start text-muted-foreground">
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colDate')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colProject')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colWeather')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colTemp')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colWorkers')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colProgress')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colStatus')}</th>
                    <th className="py-3 px-4 font-medium">{t('dailyReports.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reports.map((report) => (
                    <tr key={report.id} className="group hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs">
                        {formatJalali(report.date)}
                      </td>
                      <td className="py-3 px-4 text-xs">{report.projectName}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {getWeatherIcon(report.weather)}
                          <span className="text-xs">{WEATHER_KEYS[report.weather] ? t(WEATHER_KEYS[report.weather]) : report.weather}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {report.temperature != null ? `${report.temperature}°C` : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{report.workersOnSite ?? 0}</span>
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
                      <td className="py-3 px-4">{statusBadge(report.status)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {canEdit(report.status) && (
                            <button onClick={() => openEdit(report)} className="p-1 hover:bg-muted rounded transition-colors" title={t('common.edit')}>
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                          {canSubmit(report.status) && (
                            <button onClick={() => openSubmit(report.id)} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.submitForReview')}>
                              <Send className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          )}
                          {canDecide(report.status) && (
                            <>
                              <button onClick={() => openDecision(report.id, "approve")} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.approve')}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              </button>
                              <button onClick={() => openDecision(report.id, "revision_requested")} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.requestRevision')}>
                                <RotateCcw className="h-3.5 w-3.5 text-purple-500" />
                              </button>
                              <button onClick={() => openDecision(report.id, "reject")} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.reject')}>
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </>
                          )}
                          {report.workflowRunId && (
                            <button onClick={() => openEvents(report.id)} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.workflowHistory')}>
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                          <button onClick={() => openWorkforce(report.id)} className="p-1 hover:bg-muted rounded transition-colors" title={t('dailyReports.manageWorkforce')}>
                            <UserPlus className="h-3.5 w-3.5 text-primary" />
                          </button>
                          {canDelete(report.status) && (
                            <button onClick={() => handleDelete(report.id)} className="p-1 hover:bg-muted rounded transition-colors" title={t('common.delete')}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          )}
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

      {/* ── Create / Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? t('dailyReports.editReport') : t('dailyReports.createReport')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">{t('dailyReports.colDate')}</Label>
                <Input id="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weather">{t('dailyReports.weather')}</Label>
                <select id="weather" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={form.weather} onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}>
                  {WEATHER_OPTIONS.map((w) => (
                    <option key={w} value={w}>{t(WEATHER_KEYS[w])}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">{t('dailyReports.temperature')}</Label>
                <Input id="temperature" type="number" step="0.1" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workersOnSite">{t('dailyReports.workersOnSite')}</Label>
                <Input id="workersOnSite" type="number" min="0" value={form.workersOnSite} onChange={(e) => setForm((f) => ({ ...f, workersOnSite: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="progress">{t('dailyReports.progressPercent')}</Label>
                <Input id="progress" type="number" min="0" max="100" step="0.1" value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issues">{t('dailyReports.issues')}</Label>
              <textarea id="issues" className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" value={form.issues} onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">{t('dailyReports.notes')}</Label>
              <textarea id="notes" className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('dailyReports.saving') : editId ? t('dailyReports.updateReport') : t('dailyReports.createReport')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Submit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dailyReports.submitForReview')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('dailyReports.noWorkflows')}</p>
            {workflowsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('dailyReports.loadingWorkflows')}
              </div>
            ) : workflows.length === 0 ? (
              <p className="text-sm text-destructive">{t('dailyReports.noWorkflows')}</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="workflow">{t('dailyReports.workflowLabel')}</Label>
                <select id="workflow" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={selectedWorkflowId ?? ""} onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}>
                  <option value="">{t('dailyReports.selectWorkflow')}</option>
                  {workflows.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setSubmitDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="button" disabled={submitting || !selectedWorkflowId} onClick={handleSubmitToWorkflow}>
                {submitting ? t('dailyReports.submitting') : t('common.submit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Workflow Events Dialog ─────────────────────────────────────── */}
      <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dailyReports.workflowHistory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('dailyReports.loadingEvents')}
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t('dailyReports.noEvents')}</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 border-b border-border/50 pb-2 last:border-0">
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                    {formatJalali(ev.createdAt, "yyyy/MM/dd HH:mm")}
                  </span>
                  <div>
                    <span className="text-sm font-medium">{EVENT_KEYS[ev.action] ? t(EVENT_KEYS[ev.action]) : ev.action.replace(/_/g, " ")}</span>
                    {ev.comment && (<p className="text-xs text-muted-foreground mt-0.5">{ev.comment}</p>)}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setEventsDialogOpen(false)}>{t('common.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Decision Dialog ────────────────────────────────────────────── */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionAction === "approve" ? t('dailyReports.approveReport') : decisionAction === "reject" ? t('dailyReports.rejectReport') : t('dailyReports.requestRevision')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {decisionAction === "approve" ? t('dailyReports.confirmApproval') : decisionAction === "reject" ? t('dailyReports.provideReason') : t('dailyReports.describeRevision')}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="decision-reason">
                {decisionAction === "approve" ? t('dailyReports.commentOptional') : t('dailyReports.reason')}
              </Label>
              <textarea
                id="decision-reason"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                required={decisionAction !== "approve"}
                placeholder={decisionAction === "reject" ? t('dailyReports.reasonForRejection') : decisionAction === "revision_requested" ? t('dailyReports.describeChanges') : t('dailyReports.optionalComment')}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDecisionDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="button" disabled={decisionBusy || (decisionAction !== "approve" && !decisionReason.trim())} onClick={handleDecision} variant={decisionAction === "reject" ? "destructive" : "default"}>
                {decisionBusy ? t('dailyReports.processing') : decisionAction === "approve" ? t('dailyReports.approve') : decisionAction === "reject" ? t('dailyReports.reject') : t('dailyReports.requestRevision')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Workforce Dialog ──────────────────────────────────────────── */}
      <Dialog open={workforceDialogOpen} onOpenChange={setWorkforceDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> {t('dailyReports.workforceReport', { id: workforceReportId ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {workforceData?.aggregation && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold">{workforceData.aggregation.totalWorkers}</div>
                  <div className="text-xs text-muted-foreground">{t('dailyReports.totalWorkers')}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold">{workforceData.aggregation.totalHours}</div>
                  <div className="text-xs text-muted-foreground">{t('dailyReports.totalHours')}</div>
                </div>
                {workforceData.aggregation.byStatus.slice(0, 2).map((s) => (
                  <div key={s.status} className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="text-2xl font-bold">{s.count}</div>
                    <div className="text-xs text-muted-foreground">{ATTENDANCE_KEYS[s.status] ? t(ATTENDANCE_KEYS[s.status]) : s.status.replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            )}

            {workforceLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('dailyReports.loadingWorkforce')}
              </div>
            ) : workforceData?.entries && workforceData.entries.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-start text-muted-foreground">
                      <th className="py-2 px-3 font-medium">{t('dailyReports.personGroup')}</th>
                      <th className="py-2 px-3 font-medium">{t('dailyReports.colRole')}</th>
                      <th className="py-2 px-3 font-medium text-center">{t('dailyReports.count')}</th>
                      <th className="py-2 px-3 font-medium">{t('common.status')}</th>
                      <th className="py-2 px-3 font-medium text-center">{t('dailyReports.colHours')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {workforceData.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">
                          {entry.groupName || (entry.employeeId ? t('dailyReports.employeePrefix', { id: entry.employeeId }) : "—")}
                        </td>
                        <td className="py-2 px-3 text-xs">{entry.role}</td>
                        <td className="py-2 px-3 text-center font-mono text-xs">{entry.count}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-[10px]">
                            {ATTENDANCE_KEYS[entry.attendanceStatus] ? t(ATTENDANCE_KEYS[entry.attendanceStatus]) : entry.attendanceStatus.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-xs">{entry.hoursWorked}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('dailyReports.noWorkforce')}</p>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> {t('dailyReports.addWorkforceEntry')}
              </h4>
              {workforceError && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-xs mb-3">
                  {workforceError}
                </div>
              )}
              <form onSubmit={handleAddWorkforce} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Input type="number" min="1" placeholder={t('dailyReports.employeeIdOptional')} value={workforceForm.employeeId} onChange={(e) => setWorkforceForm((f) => ({ ...f, employeeId: e.target.value }))} />
                <Input placeholder={t('dailyReports.groupName')} value={workforceForm.groupName} onChange={(e) => setWorkforceForm((f) => ({ ...f, groupName: e.target.value }))} />
                <Input required placeholder={t('dailyReports.role')} value={workforceForm.role} onChange={(e) => setWorkforceForm((f) => ({ ...f, role: e.target.value }))} />
                <Input type="number" min="1" required placeholder={t('dailyReports.count')} value={workforceForm.count} onChange={(e) => setWorkforceForm((f) => ({ ...f, count: e.target.value }))} />
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" value={workforceForm.attendanceStatus} onChange={(e) => setWorkforceForm((f) => ({ ...f, attendanceStatus: e.target.value }))}>
                  <option value="present">{t('dailyReports.attendancePresent')}</option>
                  <option value="absent">{t('dailyReports.attendanceAbsent')}</option>
                  <option value="late">{t('dailyReports.attendanceLate')}</option>
                  <option value="on_leave">{t('dailyReports.attendanceOnLeave')}</option>
                  <option value="half_day">{t('dailyReports.attendanceHalfDay')}</option>
                </select>
                <Input type="number" min="0" max="24" step="0.5" placeholder={t('dailyReports.hoursWorked')} value={workforceForm.hoursWorked} onChange={(e) => setWorkforceForm((f) => ({ ...f, hoursWorked: e.target.value }))} />
                <div className="col-span-full flex justify-end">
                  <Button type="submit" disabled={workforceSubmitting} size="sm">
                    {workforceSubmitting ? t('dailyReports.adding') : t('dailyReports.addEntry')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
