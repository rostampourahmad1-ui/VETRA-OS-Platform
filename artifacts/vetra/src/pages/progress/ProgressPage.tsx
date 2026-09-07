import { t } from "@/lib/i18n";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, Plus, RefreshCw, Target, TrendingUp, Activity } from "lucide-react";
import { get, post } from "@/lib/phase2-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationProject } from "@/contexts/OrganizationProjectContext";
import { formatJalali } from "@/lib/jalali";

interface Baseline {
  id: number; projectId: number; name: string; version: number; isActive: number; description?: string | null; createdAt: string;
}
interface ProgressRecord {
  id: number; activityId: number; reportDate: string; progressPercent: number; actualStart?: string | null; actualFinish?: string | null; actualCost: string; actualLaborHours: string; notes?: string | null;
}
interface EvmMetric {
  id: number; baselineId?: number; reportDate: string; plannedValue: string; earnedValue: string; actualCost: string; costVariance: string; scheduleVariance: string; costPerformanceIndex: string; schedulePerformanceIndex: string; estimateAtCompletion: string; estimateToComplete: string; eacCpiSpi?: string; eacBottomUp?: string; etcBottomUp?: string;
}
interface ApiActivity {
  activityId: number; progressPercent: number; weight: number; code: string; name: string; plannedStart: string; plannedFinish: string; durationDays: number; status: string; plannedProgress: number;
}
interface ProgressSummary {
  overallProgressPercent: number; plannedProgressPercent: number; totalWeight: number; activityCount: number; reportedActivityCount: number; activeBaselineId: number | null; dateFrom: string | null; dateTo: string | null; asOfDate: string; activities: ApiActivity[];
}

function statusBadge(status: string) {
  if (status === "completed") return <Badge variant="default">Completed</Badge>;
  if (status === "in_progress") return <Badge variant="secondary">In Progress</Badge>;
  return <Badge variant="outline">Not Started</Badge>;
}

function ProgressBar({ value, max, variant }: { value: number; max: number; variant?: "actual" | "planned" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = variant === "planned" ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendChart({ records }: { records: ProgressRecord[] }) {
  const sorted = useMemo(() => [...records].sort((a, b) => a.reportDate.localeCompare(b.reportDate)), [records]);
  if (sorted.length < 2) return null;
  const maxPct = Math.max(...sorted.map((r) => r.progressPercent), 1);
  const barWidth = Math.max(8, Math.min(24, Math.floor(600 / sorted.length)));
  return (
    <div className="flex items-end gap-1 h-32 overflow-x-auto py-2">
      {sorted.map((r, i) => (
        <div key={r.id} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ width: barWidth + 8 }}>
          <span className="text-[10px] text-muted-foreground">{r.progressPercent}%</span>
          <div className="bg-emerald-500/70 rounded-t w-full transition-all" style={{ height: `${(r.progressPercent / maxPct) * 100}%`, minWidth: barWidth }} />
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">{formatJalali(r.reportDate)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProgressPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);
  const [evm, setEvm] = useState<EvmMetric[]>([]);
  const { project } = useOrganizationProject();
  const projectId = project?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [blForm, setBlForm] = useState({ name: "", description: "" });
  const [prForm, setPrForm] = useState({ activityId: "", reportDate: "", progressPercent: "0", actualCost: "0", actualLaborHours: "0", notes: "" });
  const [progressSummary, setProgressSummary] = useState<ProgressSummary | null>(null);
  const [evmForm, setEvmForm] = useState({ baselineId: "", reportDate: "", plannedValue: "0", earnedValue: "0", actualCost: "0" });

  const load = async (pid: number) => {
    if (!pid) return;
    setLoading(true); setError("");
    try {
      const [bl, pr, em] = await Promise.all([
        get<Baseline[]>(`/projects/${pid}/baselines`).catch(() => [] as Baseline[]),
        get<ProgressRecord[]>(`/projects/${pid}/progress`).catch(() => [] as ProgressRecord[]),
        get<EvmMetric[]>(`/projects/${pid}/evm`).catch(() => [] as EvmMetric[]),
      ]);
      setBaselines(bl); setProgress(pr); setEvm(em);
      try {
        const ps = await get<ProgressSummary>(`/projects/${pid}/progress-summary`);
        setProgressSummary(ps);
      } catch { setProgressSummary(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load progress data."); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId) void load(projectId); }, [projectId]);

  const createBaseline = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/baselines`, blForm); setBlForm({ name: "", description: "" }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create baseline."); }
  };

  const snapshotBaseline = async (baselineId: number) => {
    if (!projectId) return;
    try { await post(`/baselines/${baselineId}/activities`, {}); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to snapshot baseline."); }
  };

  const reportProgress = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/progress`, { ...prForm, activityId: Number(prForm.activityId), progressPercent: Number(prForm.progressPercent) }); setPrForm({ activityId: "", reportDate: "", progressPercent: "0", actualCost: "0", actualLaborHours: "0", notes: "" }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to report progress."); }
  };

  const calculateEvm = async (e: FormEvent) => {
    e.preventDefault(); if (!projectId) return;
    try { await post(`/projects/${projectId}/evm`, { ...evmForm, baselineId: Number(evmForm.baselineId) }); setEvmForm({ baselineId: "", reportDate: "", plannedValue: "0", earnedValue: "0", actualCost: "0" }); await load(projectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to calculate EVM."); }
  };

  const hasEvm = evm.length > 0;
  const latestEvm = hasEvm ? evm[0] : null;
  const cpi = latestEvm ? Number(latestEvm.costPerformanceIndex) : 0;
  const spi = latestEvm ? Number(latestEvm.schedulePerformanceIndex) : 0;
  const hasProgress = progress.length > 0;
  const hasSummary = progressSummary !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">{t("progress.breadcrumb")}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("progress.title")}</h1>
          <p className="mt-1 text-muted-foreground">Track actual progress, manage baselines, and compute EVM metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm" aria-label={t("progress.activeProject")}>{t("progress.activeProject")}: {project?.name ?? t("progress.notSelected")}</div>
          <Button variant="outline" onClick={() => projectId && load(projectId)} disabled={!projectId}><RefreshCw className="mr-2 h-4 w-4" />{t("progress.load")}</Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      {/* ─── Planned vs Actual Progress ─── */}
      {hasSummary && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Progress Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{progressSummary.overallProgressPercent}%</p>
                <p className="text-xs text-muted-foreground">Actual (Weighted)</p>
                <ProgressBar value={progressSummary.overallProgressPercent} max={100} variant="actual" />
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{progressSummary.plannedProgressPercent}%</p>
                <p className="text-xs text-muted-foreground">Planned (as of {formatJalali(progressSummary.asOfDate)})</p>
                <ProgressBar value={progressSummary.plannedProgressPercent} max={100} variant="planned" />
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{progressSummary.reportedActivityCount}/{progressSummary.activityCount}</p>
                <p className="text-xs text-muted-foreground">Activities with Progress</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{progressSummary.totalWeight}</p>
                <p className="text-xs text-muted-foreground">Total Weight (Days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── EVM Metrics ─── */}
      {hasEvm && latestEvm && (
        <div className="grid gap-4 md:grid-cols-4">
          {([
            ["CPI", cpi.toFixed(2), cpi >= 1 ? "Under budget" : "Over budget", (cpi >= 1 ? "default" : "destructive") as "default" | "destructive" | "outline"],
            ["SPI", spi.toFixed(2), spi >= 1 ? "Ahead of schedule" : "Behind schedule", (spi >= 1 ? "default" : "destructive") as "default" | "destructive" | "outline"],
            ["EAC", Number(latestEvm.estimateAtCompletion).toLocaleString(), "Estimate at completion", "outline" as const],
            ["ETC", Number(latestEvm.estimateToComplete).toLocaleString(), "Remaining to complete", "outline" as const],
          ] as const).map(([label, value, desc, variant]) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <Badge variant={variant}>{desc}</Badge>
                </div>
                <p className="text-2xl font-semibold mt-2">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── EAC Forecast Variants ─── */}
      {hasEvm && latestEvm && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />EAC Forecast Variants</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">EAC (CPI-based)</p>
                <p className="mt-1 font-mono text-lg font-bold">{Number(latestEvm.estimateAtCompletion).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">BAC / CPI</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">EAC (CPI × SPI)</p>
                <p className="mt-1 font-mono text-lg font-bold">{Number(latestEvm.eacCpiSpi ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">BAC / (CPI × SPI)</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">EAC (Bottom-up)</p>
                <p className="mt-1 font-mono text-lg font-bold">{Number(latestEvm.eacBottomUp ?? 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">AC + Bottom-up ETC</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Progress Trend Chart ─── */}
      {hasProgress && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Progress Trend</CardTitle></CardHeader>
          <CardContent>
            {progress.length < 2 ? (
              <p className="text-sm text-muted-foreground">Need at least 2 progress records to show trend.</p>
            ) : (
              <TrendChart records={progress} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Activity-Level Breakdown ─── */}
      {hasSummary && progressSummary.activities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Activity Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">Code</th>
                    <th className="py-2 px-3 font-medium">Name</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium text-right">Weight</th>
                    <th className="py-2 px-3 font-medium text-right">Actual</th>
                    <th className="py-2 px-3 font-medium text-right">Planned</th>
                  </tr>
                </thead>
                <tbody>
                  {progressSummary.activities.map((a) => (
                    <tr key={a.activityId} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs">{a.code}</td>
                      <td className="py-2 px-3">{a.name}</td>
                      <td className="py-2 px-3">{statusBadge(a.status)}</td>
                      <td className="py-2 px-3 text-right">{a.weight}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="font-medium">{a.progressPercent}%</span>
                        <ProgressBar value={a.progressPercent} max={100} variant="actual" />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="font-medium text-blue-600">{a.plannedProgress}%</span>
                        <ProgressBar value={a.plannedProgress} max={100} variant="planned" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Forms ─── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />New baseline</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={createBaseline}>
              <Input required placeholder="Baseline name" value={blForm.name} onChange={(e) => setBlForm({ ...blForm, name: e.target.value })} />
              <Textarea placeholder="Description" value={blForm.description} onChange={(e) => setBlForm({ ...blForm, description: e.target.value })} />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Create baseline</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Report progress</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />{t("progress.calculateEvm")}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={calculateEvm}>
              <Input required type="number" min="1" placeholder="Baseline ID" value={evmForm.baselineId} onChange={(e) => setEvmForm({ ...evmForm, baselineId: e.target.value })} />
              <Input required type="date" value={evmForm.reportDate} onChange={(e) => setEvmForm({ ...evmForm, reportDate: e.target.value })} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Planned value (PV)" value={evmForm.plannedValue} onChange={(e) => setEvmForm({ ...evmForm, plannedValue: e.target.value })} />
                <Input placeholder="Earned value (EV)" value={evmForm.earnedValue} onChange={(e) => setEvmForm({ ...evmForm, earnedValue: e.target.value })} />
                <Input placeholder="Actual cost (AC)" value={evmForm.actualCost} onChange={(e) => setEvmForm({ ...evmForm, actualCost: e.target.value })} />
              </div>
              <Button type="submit"><BarChart3 className="mr-2 h-4 w-4" />{t("common.submit")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* ─── Baselines & Progress Records ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Baselines <span className="text-sm font-normal text-muted-foreground">({baselines.length})</span></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : baselines.length === 0 ? <p className="text-sm text-muted-foreground">No baselines defined.</p> : <div className="space-y-3">{baselines.map((bl) => <div key={bl.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{bl.name} <span className="text-xs text-muted-foreground">v{bl.version}</span></h3><p className="text-sm text-muted-foreground">{bl.description || "—"}</p></div><div className="flex items-center gap-2">{bl.isActive ? <Badge variant="default">Active</Badge> : null}<Button variant="outline" size="sm" onClick={() => snapshotBaseline(bl.id)}>Snapshot</Button></div></div></div>)}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Progress Records <span className="text-sm font-normal text-muted-foreground">({progress.length})</span></CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : progress.length === 0 ? <p className="text-sm text-muted-foreground">No progress records.</p> : <div className="space-y-3">{progress.slice(0, 10).map((pr) => <div key={pr.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-sm">Activity #{pr.activityId}</h3><p className="text-xs text-muted-foreground">{formatJalali(pr.reportDate)}</p></div><Badge variant={pr.progressPercent >= 100 ? "default" : pr.progressPercent > 0 ? "secondary" : "outline"}>{pr.progressPercent}%</Badge></div>{pr.notes && <p className="mt-1 text-xs text-muted-foreground">{pr.notes}</p>}</div>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
