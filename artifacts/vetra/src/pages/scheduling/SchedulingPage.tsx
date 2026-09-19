import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWbs,
  useUpdatePlanningActivity,
  getListWbsQueryKey,
} from "@workspace/api-client-react";
import type {
  PlanningActivity,
  PlanningActivityUpdate,
} from "@workspace/api-client-react";
import { useOrganizationProject } from "@/contexts/OrganizationProjectContext";
import { useToast } from "@/hooks/use-toast";
import { get, post, apiRequest } from "@/lib/phase2-api";
import { formatJalali, persianNumber } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ScheduleWorkspace, { type EditableField } from "./ScheduleWorkspace";
import {
  buildScheduleRows,
  getScheduleRange,
  resizeActivity,
  shiftActivity,
  type ScheduleDependency,
  type ScheduleScale,
} from "./schedule-utils";

type ProjectCalendar = {
  id: number;
  projectId: number;
  name: string;
  workDays: string;
  workStartHour: string;
  workEndHour: string;
  isDefault: number;
};

type CalendarException = {
  id: number;
  exceptionDate: string;
  isWorkingDay: number;
  description?: string | null;
};

type CpmSummary = { criticalPath?: number[]; projectFinishDays?: number };

function SkeletonWorkspace() {
  return (
    <div className="animate-pulse rounded-xl border border-[var(--schedule-border)] bg-[var(--schedule-surface-0)] p-3">
      <div className="mb-3 h-8 w-52 rounded bg-[var(--schedule-surface-2)]" />
      <div className="space-y-2">
        {Array.from({ length: 10 }, (_, index) => (
          <div
            key={index}
            className="h-9 rounded bg-[var(--schedule-surface-2)]/70"
          />
        ))}
      </div>
    </div>
  );
}

function DependencyDialog({
  open,
  onOpenChange,
  activities,
  dependencies,
  onCreate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: PlanningActivity[];
  dependencies: ScheduleDependency[];
  onCreate: (input: {
    predecessorId: number;
    successorId: number;
    dependencyType: string;
    lagDays: number;
  }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [dependencyType, setDependencyType] = useState("FS");
  const [lagDays, setLagDays] = useState("0");
  const [saving, setSaving] = useState(false);
  const activityName = (id: number) =>
    activities.find((activity) => activity.id === id)?.code ?? `#${id}`;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!predecessorId || !successorId || predecessorId === successorId) return;
    setSaving(true);
    try {
      await onCreate({
        predecessorId: Number(predecessorId),
        successorId: Number(successorId),
        dependencyType,
        lagDays: Number(lagDays),
      });
      setPredecessorId("");
      setSuccessorId("");
      setLagDays("0");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>وابستگی‌های برنامه</DialogTitle>
          <DialogDescription>
            ارتباط بین فعالیت‌ها را با قرارداد فعلی پروژه مدیریت کنید.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-lg border border-[var(--schedule-border)] bg-[var(--schedule-surface-1)] p-3 sm:grid-cols-[1fr_1fr_110px_80px_auto] sm:items-end"
        >
          <label className="grid gap-1 text-xs">
            <span>پیش‌نیاز</span>
            <select
              value={predecessorId}
              onChange={(event) => setPredecessorId(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">انتخاب فعالیت</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.code} · {activity.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>پس‌نیاز</span>
            <select
              value={successorId}
              onChange={(event) => setSuccessorId(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">انتخاب فعالیت</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.code} · {activity.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>نوع</span>
            <select
              value={dependencyType}
              onChange={(event) => setDependencyType(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-xs"
            >
              <option value="FS">FS</option>
              <option value="SS">SS</option>
              <option value="FF">FF</option>
              <option value="SF">SF</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span>تأخیر</span>
            <Input
              type="number"
              min="0"
              value={lagDays}
              onChange={(event) => setLagDays(event.target.value)}
              className="h-9"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={saving || !predecessorId || !successorId}
          >
            <Plus className="h-3.5 w-3.5" />
            افزودن
          </Button>
        </form>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {dependencies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              وابستگی‌ای ثبت نشده است.
            </p>
          ) : (
            dependencies.map((dependency) => (
              <div
                key={dependency.id}
                className="flex items-center justify-between rounded-lg border border-[var(--schedule-border)] px-3 py-2 text-xs"
              >
                <span dir="ltr" className="font-mono">
                  {activityName(dependency.predecessorId)}{" "}
                  <span className="text-[var(--schedule-accent-strong)]">
                    {dependency.dependencyType}
                  </span>{" "}
                  {activityName(dependency.successorId)} · lag{" "}
                  {persianNumber(dependency.lagDays)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void onDelete(dependency.id)}
                  aria-label="حذف وابستگی"
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalendarDialog({
  open,
  onOpenChange,
  calendars,
  exceptions,
  selectedCalendarId,
  onSelectCalendar,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: ProjectCalendar[];
  exceptions: CalendarException[];
  selectedCalendarId: number | null;
  onSelectCalendar: (id: number) => void;
  onCreate: (input: {
    name: string;
    workDays: string;
    workStartHour: string;
    workEndHour: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("تقویم کاری پروژه");
  const [workDays, setWorkDays] = useState("1,2,3,4,5,6");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onCreate({
        name,
        workDays,
        workStartHour: start,
        workEndHour: end,
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader className="text-right">
          <DialogTitle>تقویم کاری پروژه</DialogTitle>
          <DialogDescription>
            روزهای کاری و تعطیلات استثنا از تقویم ذخیره‌شده‌ی پروژه خوانده
            می‌شوند.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium">تقویم‌های موجود</p>
            {calendars.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                تقویمی ثبت نشده است.
              </p>
            ) : (
              calendars.map((calendar) => (
                <button
                  type="button"
                  key={calendar.id}
                  onClick={() => onSelectCalendar(calendar.id)}
                  className={`w-full rounded-lg border p-3 text-right text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)] ${selectedCalendarId === calendar.id ? "border-[var(--schedule-accent)] bg-[var(--schedule-accent)]/10" : "border-[var(--schedule-border)]"}`}
                >
                  <strong className="block">{calendar.name}</strong>
                  <span className="mt-1 block text-muted-foreground">
                    روزها: {calendar.workDays} · {calendar.workStartHour} تا{" "}
                    {calendar.workEndHour}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium">تعطیلات و استثناها</p>
            {exceptions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                برای تقویم انتخاب‌شده استثنایی ثبت نشده است.
              </p>
            ) : (
              exceptions.map((exception) => (
                <div
                  key={exception.id}
                  className="rounded-lg border border-[var(--schedule-border)] p-2 text-xs"
                >
                  <span className="font-mono" dir="ltr">
                    {formatJalali(exception.exceptionDate)}
                  </span>
                  <span className="mr-2 text-muted-foreground">
                    {exception.description ??
                      (exception.isWorkingDay ? "روز کاری ویژه" : "تعطیل")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <form
          onSubmit={submit}
          className="grid gap-3 border-t border-[var(--schedule-border)] pt-4"
        >
          <p className="text-xs font-medium">افزودن تقویم</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="نام تقویم"
            required
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              value={workDays}
              onChange={(event) => setWorkDays(event.target.value)}
              placeholder="روزها، مثال ۱ تا ۶"
            />
            <Input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <Input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              <Plus className="h-4 w-4" />
              ایجاد تقویم
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SchedulingPage() {
  const { project } = useOrganizationProject();
  const projectId = project?.id ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useListWbs(projectId, {
    query: { queryKey: getListWbsQueryKey(projectId), enabled: projectId > 0 },
  });
  const updateActivity = useUpdatePlanningActivity();
  const [dependencies, setDependencies] = useState<ScheduleDependency[]>([]);
  const [calendars, setCalendars] = useState<ProjectCalendar[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(
    null,
  );
  const [cpm, setCpm] = useState<CpmSummary | null>(null);
  const [supplementalError, setSupplementalError] = useState("");
  const [scale, setScale] = useState<ScheduleScale>("week");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dependencyOpen, setDependencyOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const loadSupplemental = useCallback(async () => {
    if (!projectId) return;
    setSupplementalError("");
    try {
      const [dependencyData, calendarData, cpmData] = await Promise.all([
        get<ScheduleDependency[]>(`/projects/${projectId}/dependencies`),
        get<ProjectCalendar[]>(`/projects/${projectId}/calendars`),
        get<CpmSummary>(`/projects/${projectId}/cpm`),
      ]);
      setDependencies(dependencyData ?? []);
      setCalendars(calendarData ?? []);
      setCpm(cpmData ?? null);
      const defaultCalendar =
        calendarData?.find((calendar) => calendar.isDefault) ??
        calendarData?.[0];
      if (defaultCalendar) {
        setSelectedCalendarId(defaultCalendar.id);
        setExceptions(
          await get<CalendarException[]>(
            `/calendars/${defaultCalendar.id}/exceptions`,
          ).catch(() => []),
        );
      }
    } catch (cause) {
      setSupplementalError(
        cause instanceof Error
          ? cause.message
          : "دریافت اطلاعات زمان‌بندی ناموفق بود.",
      );
    }
  }, [projectId]);

  useEffect(() => {
    void loadSupplemental();
  }, [loadSupplemental]);

  const wbsItems = data?.wbs ?? [];
  const activities = data?.activities ?? [];
  const rows = useMemo(
    () => buildScheduleRows(wbsItems, activities, dependencies, collapsed),
    [activities, collapsed, dependencies, wbsItems],
  );
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa");
    if (!normalized) return rows;
    return rows.filter(
      (row) =>
        `${row.code} ${row.name}`
          .toLocaleLowerCase("fa")
          .includes(normalized) ||
        (row.kind === "activity" &&
          row.activity?.code.toLocaleLowerCase("fa").includes(normalized)),
    );
  }, [query, rows]);
  const range = useMemo(() => getScheduleRange(rows), [rows]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: getListWbsQueryKey(projectId),
    });
  }, [projectId, queryClient]);
  const saveActivity = useCallback(
    async (activity: PlanningActivity, update: PlanningActivityUpdate) => {
      try {
        await updateActivity.mutateAsync({
          projectId,
          activityId: activity.id,
          data: update,
        });
        invalidate();
        toast({
          title: "ذخیره شد",
          description: `فعالیت ${activity.code} به‌روزرسانی شد.`,
        });
      } catch (cause) {
        toast({
          title: "ذخیره انجام نشد",
          description:
            cause instanceof Error
              ? cause.message
              : "اطلاعات فعالیت ذخیره نشد.",
          variant: "destructive",
        });
      }
    },
    [invalidate, projectId, toast, updateActivity],
  );
  const saveCell = useCallback(
    (activity: PlanningActivity, field: EditableField, value: string) => {
      const update: PlanningActivityUpdate =
        field === "durationDays"
          ? { durationDays: Math.max(0, Number(value) || 0) }
          : field === "name"
            ? { name: value.trim() }
            : ({ [field]: value } as PlanningActivityUpdate);
      if (
        (field === "plannedStart" && value > activity.plannedFinish) ||
        (field === "plannedFinish" && value < activity.plannedStart)
      ) {
        toast({
          title: "تاریخ نامعتبر",
          description: "پایان فعالیت باید بعد از شروع آن باشد.",
          variant: "destructive",
        });
        return;
      }
      void saveActivity(activity, update);
    },
    [saveActivity, toast],
  );
  const shift = useCallback(
    (activity: PlanningActivity, deltaDays: number) => {
      void saveActivity(activity, shiftActivity(activity, deltaDays));
    },
    [saveActivity],
  );
  const resize = useCallback(
    (activity: PlanningActivity, deltaDays: number) => {
      if (activity.activityType !== "milestone")
        void saveActivity(activity, resizeActivity(activity, deltaDays));
    },
    [saveActivity],
  );

  const createDependency = async (input: {
    predecessorId: number;
    successorId: number;
    dependencyType: string;
    lagDays: number;
  }) => {
    try {
      await post(`/projects/${projectId}/dependencies`, input);
      await loadSupplemental();
      toast({ title: "وابستگی ثبت شد" });
    } catch (cause) {
      toast({
        title: "ثبت وابستگی ناموفق بود",
        description:
          cause instanceof Error ? cause.message : "خطا در ذخیره وابستگی.",
        variant: "destructive",
      });
      throw cause;
    }
  };
  const deleteDependency = async (id: number) => {
    try {
      await apiRequest(`/dependencies/${id}`, { method: "DELETE" });
      await loadSupplemental();
      toast({ title: "وابستگی حذف شد" });
    } catch (cause) {
      toast({
        title: "حذف وابستگی ناموفق بود",
        description:
          cause instanceof Error ? cause.message : "خطا در حذف وابستگی.",
        variant: "destructive",
      });
    }
  };
  const createCalendar = async (input: {
    name: string;
    workDays: string;
    workStartHour: string;
    workEndHour: string;
  }) => {
    try {
      await post(`/projects/${projectId}/calendars`, input);
      await loadSupplemental();
      toast({ title: "تقویم ایجاد شد" });
    } catch (cause) {
      toast({
        title: "ایجاد تقویم ناموفق بود",
        description:
          cause instanceof Error ? cause.message : "خطا در ایجاد تقویم.",
        variant: "destructive",
      });
      throw cause;
    }
  };
  const selectCalendar = async (id: number) => {
    setSelectedCalendarId(id);
    setExceptions(
      await get<CalendarException[]>(`/calendars/${id}/exceptions`).catch(
        () => [],
      ),
    );
  };
  const openRow = (row: { id: string }) => setSelectedId(row.id);

  if (!projectId)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <CalendarDays className="h-10 w-10 text-amber-500" />
        <h1 className="text-xl font-semibold">پروژه‌ای انتخاب نشده است</h1>
        <p className="text-sm text-muted-foreground">
          برای مشاهده‌ی برنامه، ابتدا سازمان و پروژه‌ی فعال را انتخاب کنید.
        </p>
        <Link href="/onboarding">
          <Button>انتخاب پروژه</Button>
        </Link>
      </div>
    );
  if (isLoading)
    return (
      <div className="space-y-5" dir="rtl">
        <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
        <SkeletonWorkspace />
      </div>
    );
  if (isError)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-destructive">
        <p>دریافت فعالیت‌های پروژه ناموفق بود.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          تلاش دوباره
        </Button>
      </div>
    );

  return (
    <div className="schedule-shell space-y-4 pb-8" dir="rtl">
      <header className="flex flex-col gap-4 rounded-xl border border-[var(--schedule-border)] bg-[var(--schedule-surface-0)] p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--schedule-accent-strong)]">
            کنترل پروژه / زمان‌بندی
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {project?.name ?? "برنامه پروژه"}
            </h1>
            <Badge variant="outline" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--schedule-accent)]" />
              ویرایش دستی
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            WBS، تقویم شمسی و روابط فعالیت‌ها در یک فضای کاری یکپارچه
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-[var(--schedule-border)] bg-[var(--schedule-surface-1)] px-3 py-2 text-xs text-muted-foreground">
            شروع برنامه:{" "}
            <strong className="mr-1 text-foreground">
              {range?.start ? formatJalali(range.start, "d MMMM yyyy") : "—"}
            </strong>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSupplemental()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            به‌روزرسانی
          </Button>
          <Link href={`/projects/${projectId}/activities`}>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              فعالیت جدید
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-[var(--schedule-border)] bg-[var(--schedule-surface-0)] p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-lg bg-[var(--schedule-surface-1)] p-1"
            role="group"
            aria-label="مقیاس زمانی"
          >
            {(["day", "week", "month"] as ScheduleScale[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setScale(item)}
                className={`rounded-md px-3 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)] ${scale === item ? "bg-[var(--schedule-accent)] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {item === "day" ? "روز" : item === "week" ? "هفته" : "ماه"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجوی WBS یا فعالیت"
              className="h-9 w-52 pr-8 text-xs"
            />
          </div>
          <div className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {persianNumber(cpm?.criticalPath?.length ?? 0)} فعالیت در تحلیل CPM
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCalendarOpen(true)}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            تقویم کاری
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDependencyOpen(true)}
          >
            <GitBranch className="h-3.5 w-3.5" />
            وابستگی‌ها{" "}
            <span className="font-mono">
              {persianNumber(dependencies.length)}
            </span>
          </Button>
        </div>
      </div>

      {supplementalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {supplementalError}
        </div>
      )}
      {activities.length === 0 ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--schedule-border)] bg-[var(--schedule-surface-0)] text-center">
          <CalendarDays className="h-12 w-12 text-[var(--schedule-accent)]/50" />
          <h2 className="text-lg font-semibold">
            هنوز فعالیتی برای این پروژه ثبت نشده است
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            ابتدا WBS و فعالیت‌های پروژه را تعریف کنید تا برنامه‌ی شمسی در اینجا
            نمایش داده شود.
          </p>
          <Link href={`/projects/${projectId}/activities`}>
            <Button>
              <Plus className="h-4 w-4" />
              افزودن اولین فعالیت
            </Button>
          </Link>
        </div>
      ) : (
        <ScheduleWorkspace
          rows={filteredRows}
          activities={activities}
          dependencies={dependencies}
          scale={scale}
          selectedId={selectedId}
          onSelect={openRow}
          onToggle={(wbsId) =>
            setCollapsed((current) => {
              const next = new Set(current);
              if (next.has(wbsId)) next.delete(wbsId);
              else next.add(wbsId);
              return next;
            })
          }
          onToggleAll={(expand) =>
            setCollapsed(
              expand ? new Set() : new Set(wbsItems.map((item) => item.id)),
            )
          }
          onSave={saveCell}
          onShift={shift}
          onResize={resize}
          onOpenCalendar={() => setCalendarOpen(true)}
        />
      )}

      <DependencyDialog
        open={dependencyOpen}
        onOpenChange={setDependencyOpen}
        activities={activities}
        dependencies={dependencies}
        onCreate={createDependency}
        onDelete={deleteDependency}
      />
      <CalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        calendars={calendars}
        exceptions={exceptions}
        selectedCalendarId={selectedCalendarId}
        onSelectCalendar={(id) => void selectCalendar(id)}
        onCreate={createCalendar}
      />
    </div>
  );
}
