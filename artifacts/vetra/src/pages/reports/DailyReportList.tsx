import React, { useState, useCallback } from "react";
import { useListDailyReports, useCreateDailyReport, getListDailyReportsQueryKey } from "@workspace/api-client-react";
import type { DailyReport } from "@workspace/api-client-react";
import { Plus, Users, CloudRain, Sun, Pencil, Trash2, Send, CheckCircle2, XCircle, RotateCcw, History, Loader2, UserPlus, Clock, Briefcase } from "lucide-react";
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
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision Requested",
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
    <Badge variant="outline" className={`border ${colors[s] ?? colors.draft} font-mono text-[10px] uppercase`}>
      {STATUS_LABELS[s] ?? s}
    </Badge>
  );
}

const WEATHER_OPTIONS = ["clear", "cloudy", "rain", "storm", "fog", "hot", "cold"] as const;

// ─── Workflow event type ───────────────────────────────────────────────────

interface WorkflowEvent {
  id: number;
  action: string;
  comment?: string | null;
  actorId: number;
  createdAt: string;
  workflowStepId?: number | null;
}

// ─── Main component ────────────────────────────────────────────────────────

export default function DailyReportList() {
  const { project } = useOrganizationProject();
  const queryClient = useQueryClient();

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: reports, isLoading, isError, error: fetchError } = useListDailyReports(
    project?.id ? { projectId: project.id } : undefined,
  );

  const createMutation = useCreateDailyReport();

  // ── Form state ─────────────────────────────────────────────────────────

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

  // ── Submit / workflow state ───────────────────────────────────────────

  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitTargetId, setSubmitTargetId] = useState<number | null>(null);
  const [workflows, setWorkflows] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);

  // ── Workflow events dialog ────────────────────────────────────────────

  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // ── Decision dialog ───────────────────────────────────────────────────

  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [decisionTargetId, setDecisionTargetId] = useState<number | null>(null);
  const [decisionAction, setDecisionAction] = useState<"approve" | "reject" | "revision_requested">("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);

  // ── Invalidate helper ─────────────────────────────────────────────────

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListDailyReportsQueryKey() });
  }, [queryClient]);

  // ── Form helpers ──────────────────────────────────────────────────────

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
      setError("Please select a project first.");
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

  // ── CRUD handlers ─────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id && !editId) {
      setError("Please select a project first.");
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
      setError(cause instanceof Error ? cause.message : "Failed to save report.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this daily report?")) return;
    try {
      await apiRequest(`/daily-reports/${id}`, { method: "DELETE" });
      invalidate();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to delete report.");
    }
  };

  // ── Submit handler ────────────────────────────────────────────────────

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
      setError(cause instanceof Error ? cause.message : "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Workflow events handler ───────────────────────────────────────────

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

  // ── Decision handler ──────────────────────────────────────────────────

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
      setError(cause instanceof Error ? cause.message : "Failed to process decision.");
    } finally {
      setDecisionBusy(false);
    }
  };

  // ── Weather icon ──────────────────────────────────────────────────────

  const getWeatherIcon = (weather: string) => {
    const w = weather.toLowerCase();
    if (w.includes("rain")) return <CloudRain className="h-4 w-4 text-blue-400" />;
    if (w.includes("sun") || w.includes("clear")) return <Sun className="h-4 w-4 text-amber-500" />;
    return <CloudRain className="h-4 w-4 text-muted-foreground" />;
  };

  // ── Permission helpers ────────────────────────────────────────────────

  const canEdit = (status: string | undefined) => status === "draft" || status === "revision_requested";
  const canDelete = (status: string | undefined) => status !== "approved";
  const canSubmit = (status: string | undefined) => status === "draft";
  const canDecide = (status: string | undefined) => status === "in_review";

  // ── Workforce handlers ───────────────────────────────────────────────

  const fetchWorkforce = async (reportId: number) => {
    setWorkforceLoading(true);
    setWorkforceError("");
    try {
      const data = await apiRequest<WorkforceData>(`/daily-reports/${reportId}/workforce`);
      setWorkforceData(data);
    } catch (cause: unknown) {
      setWorkforceError(cause instanceof Error ? cause.message : "Failed to load workforce data.");
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
    if (!workforceForm.role.trim()) { setWorkforceError("Role is required."); return; }
    if (!workforceForm.employeeId && !workforceForm.groupName.trim()) {
      setWorkforceError("Either employee ID or group name is required.");
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
      setWorkforceError(cause instanceof Error ? cause.message : "Failed to add workforce entry.");
    } finally {
      setWorkforceSubmitting(false);
    }
  };

  // ── Workforce state ──────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────

  const hasReports = reports && reports.length > 0;

  return (
    <>
      <div className="space-y-6">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Site Reports</h1>
            <p className="text-muted-foreground">Track daily site progress, weather, and issues.</p>
          </div>
          <Button className="shrink-0 gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Log Report
          </Button>
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────── */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading reports...
            </div>
          ) : isError ? (
            <div className="py-20 text-center text-destructive">
              {(fetchError as Error)?.message ?? "Failed to load reports."}
            </div>
          ) : !hasReports ? (
            <div className="py-20 text-center text-muted-foreground">
              {project
                ? "No daily reports for this project yet."
                : "Select a project to view daily reports."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Project</th>
                    <th className="py-3 px-4 font-medium">Weather</th>
                    <th className="py-3 px-4 font-medium">Temp</th>
                    <th className="py-3 px-4 font-medium">Workers</th>
                    <th className="py-3 px-4 font-medium">Progress</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Actions</th>
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
                          <span className="text-xs capitalize">{report.weather}</span>
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
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${report.progress}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{report.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">{statusBadge(report.status)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {/* Edit */}
                          {canEdit(report.status) && (
                            <button
                              onClick={() => openEdit(report)}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}

                          {/* Submit */}
                          {canSubmit(report.status) && (
                            <button
                              onClick={() => openSubmit(report.id)}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="Submit for review"
                            >
                              <Send className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          )}

                          {/* Approve / Reject / Revision */}
                          {canDecide(report.status) && (
                            <>
                              <button
                                onClick={() => openDecision(report.id, "approve")}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Approve"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              </button>
                              <button
                                onClick={() => openDecision(report.id, "revision_requested")}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Request revision"
                              >
                                <RotateCcw className="h-3.5 w-3.5 text-purple-500" />
                              </button>
                              <button
                                onClick={() => openDecision(report.id, "reject")}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Reject"
                              >
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              </button>
                            </>
                          )}

                          {/* Workflow events */}
                          {report.workflowRunId && (
                            <button
                              onClick={() => openEvents(report.id)}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="View workflow history"
                            >
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}

                          {/* Workforce */}
                          <button
                            onClick={() => openWorkforce(report.id)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Manage workforce"
                          >
                            <UserPlus className="h-3.5 w-3.5 text-primary" />
                          </button>

                          {/* Delete */}
                          {canDelete(report.status) && (
                            <button
                              onClick={() => handleDelete(report.id)}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="Delete"
                            >
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
            <DialogTitle>{editId ? "Edit Daily Report" : "Log Daily Report"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weather">Weather</Label>
                <select
                  id="weather"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={form.weather}
                  onChange={(e) => setForm((f) => ({ ...f, weather: e.target.value }))}
                >
                  {WEATHER_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w.charAt(0).toUpperCase() + w.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="temperature">Temperature (°C)</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workersOnSite">Workers on Site</Label>
                <Input
                  id="workersOnSite"
                  type="number"
                  min="0"
                  value={form.workersOnSite}
                  onChange={(e) => setForm((f) => ({ ...f, workersOnSite: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="progress">Progress (%)</Label>
                <Input
                  id="progress"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.progress}
                  onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issues">Issues</Label>
              <textarea
                id="issues"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                value={form.issues}
                onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editId ? "Update Report" : "Create Report"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Submit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit for Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select an approval workflow to submit this daily report for review.
            </p>
            {workflowsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading workflows...
              </div>
            ) : workflows.length === 0 ? (
              <p className="text-sm text-destructive">
                No active workflows found for daily reports. Please create a workflow first.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="workflow">Workflow</Label>
                <select
                  id="workflow"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={selectedWorkflowId ?? ""}
                  onChange={(e) => setSelectedWorkflowId(Number(e.target.value) || null)}
                >
                  <option value="">Select a workflow...</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setSubmitDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={submitting || !selectedWorkflowId}
                onClick={handleSubmitToWorkflow}
              >
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Workflow Events Dialog ─────────────────────────────────────── */}
      <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workflow History</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading events...
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No workflow events found.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 border-b border-border/50 pb-2 last:border-0">
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap mt-0.5">
                    {formatJalali(ev.createdAt, "yyyy/MM/dd HH:mm")}
                  </span>
                  <div>
                    <span className="text-sm font-medium capitalize">{ev.action.replace(/_/g, " ")}</span>
                    {ev.comment && (
                      <p className="text-xs text-muted-foreground mt-0.5">{ev.comment}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setEventsDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Decision Dialog ────────────────────────────────────────────── */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionAction === "approve"
                ? "Approve Report"
                : decisionAction === "reject"
                  ? "Reject Report"
                  : "Request Revision"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {decisionAction === "approve"
                ? "Confirm approval of this daily report."
                : decisionAction === "reject"
                  ? "Provide a reason for rejecting this daily report."
                  : "Describe what needs to be revised in this daily report."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="decision-reason">
                {decisionAction === "approve" ? "Comment (optional)" : "Reason"}
              </Label>
              <textarea
                id="decision-reason"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                required={decisionAction !== "approve"}
                placeholder={
                  decisionAction === "reject"
                    ? "Reason for rejection..."
                    : decisionAction === "revision_requested"
                      ? "Describe required changes..."
                      : "Optional comment..."
                }
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDecisionDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={decisionBusy || (decisionAction !== "approve" && !decisionReason.trim())}
                onClick={handleDecision}
                variant={
                  decisionAction === "approve"
                    ? "default"
                    : decisionAction === "reject"
                      ? "destructive"
                      : "default"
                }
              >
                {decisionBusy
                  ? "Processing..."
                  : decisionAction === "approve"
                    ? "Approve"
                    : decisionAction === "reject"
                      ? "Reject"
                      : "Request Revision"}
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
              <Users className="h-5 w-5" /> Workforce — Daily Report #{workforceReportId}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* ── Aggregation Summary ─────────────────────────────────── */}
            {workforceData?.aggregation && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold">{workforceData.aggregation.totalWorkers}</div>
                  <div className="text-xs text-muted-foreground">Total Workers</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold">{workforceData.aggregation.totalHours}</div>
                  <div className="text-xs text-muted-foreground">Total Hours</div>
                </div>
                {workforceData.aggregation.byStatus.slice(0, 2).map((s) => (
                  <div key={s.status} className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="text-2xl font-bold">{s.count}</div>
                    <div className="text-xs text-muted-foreground capitalize">{s.status.replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Workforce Entries Table ─────────────────────────────── */}
            {workforceLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workforce...
              </div>
            ) : workforceData?.entries && workforceData.entries.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="py-2 px-3 font-medium">Person/Group</th>
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-3 font-medium text-center">Count</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium text-center">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {workforceData.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-medium">
                          {entry.groupName || (entry.employeeId ? `Employee #${entry.employeeId}` : "—")}
                        </td>
                        <td className="py-2 px-3 text-xs">{entry.role}</td>
                        <td className="py-2 px-3 text-center font-mono text-xs">{entry.count}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {entry.attendanceStatus.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-xs">{entry.hoursWorked}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No workforce entries yet. Add one below.
              </p>
            )}

            {/* ── Add Workforce Form ──────────────────────────────────── */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Add Workforce Entry
              </h4>
              {workforceError && (
                <div className="bg-destructive/10 border border-destructive text-destructive px-3 py-2 rounded-lg text-xs mb-3">
                  {workforceError}
                </div>
              )}
              <form onSubmit={handleAddWorkforce} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Input
                  type="number" min="1" placeholder="Employee ID (optional)"
                  value={workforceForm.employeeId}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, employeeId: e.target.value }))}
                />
                <Input
                  placeholder="Group name (e.g., Masonry Team)"
                  value={workforceForm.groupName}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, groupName: e.target.value }))}
                />
                <Input required
                  placeholder="Role (e.g., Mason, Engineer)"
                  value={workforceForm.role}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, role: e.target.value }))}
                />
                <Input type="number" min="1" required
                  placeholder="Count"
                  value={workforceForm.count}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, count: e.target.value }))}
                />
                <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={workforceForm.attendanceStatus}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, attendanceStatus: e.target.value }))}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="on_leave">On Leave</option>
                  <option value="half_day">Half Day</option>
                </select>
                <Input type="number" min="0" max="24" step="0.5"
                  placeholder="Hours worked"
                  value={workforceForm.hoursWorked}
                  onChange={(e) => setWorkforceForm((f) => ({ ...f, hoursWorked: e.target.value }))}
                />
                <div className="col-span-full flex justify-end">
                  <Button type="submit" disabled={workforceSubmitting} size="sm">
                    {workforceSubmitting ? "Adding..." : "Add Entry"}
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
