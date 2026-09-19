import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Info,
  PanelRight,
} from "lucide-react";
import type { PlanningActivity } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatJalali, persianNumber } from "@/lib/jalali";
import GanttChart from "./GanttChart";
import {
  addDays,
  jalaliMonthStart,
  type ScheduleDependency,
  type ScheduleRow,
  type ScheduleScale,
} from "./schedule-utils";

type EditableField = "name" | "plannedStart" | "plannedFinish" | "durationDays";

type ScheduleWorkspaceProps = {
  rows: ScheduleRow[];
  activities: PlanningActivity[];
  dependencies: ScheduleDependency[];
  scale: ScheduleScale;
  selectedId: string | null;
  onSelect: (row: ScheduleRow) => void;
  onToggle: (wbsId: number) => void;
  onToggleAll: (expand: boolean) => void;
  onSave: (
    activity: PlanningActivity,
    field: EditableField,
    value: string,
  ) => void;
  onShift: (activity: PlanningActivity, deltaDays: number) => void;
  onResize: (activity: PlanningActivity, deltaDays: number) => void;
  onOpenCalendar: () => void;
  readOnly?: boolean;
};

function GridHeader() {
  return (
    <div
      className="sticky top-0 z-50 grid h-[52px] grid-cols-[72px_minmax(180px,1fr)_58px_92px_92px_76px_54px] items-center border-b border-[var(--schedule-border)] bg-[var(--schedule-surface-1)]/95 px-2 text-[11px] font-semibold text-[var(--schedule-text-muted)] backdrop-blur"
      role="row"
    >
      <span dir="ltr" className="text-left">
        WBS
      </span>
      <span>نام فعالیت</span>
      <span className="text-center">مدت</span>
      <span className="text-center">شروع</span>
      <span className="text-center">پایان</span>
      <span className="text-center">پیش‌نیاز</span>
      <span className="text-center">سهم</span>
    </div>
  );
}

function EditableCell({
  row,
  field,
  value,
  onSave,
  readOnly,
}: {
  row: ScheduleRow;
  field: EditableField;
  value: string;
  onSave: (
    activity: PlanningActivity,
    field: EditableField,
    value: string,
  ) => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (row.kind === "summary" || readOnly)
    return <span className="truncate">{value}</span>;
  if (editing) {
    return (
      <Input
        ref={inputRef}
        type={
          field === "durationDays"
            ? "number"
            : field === "name"
              ? "text"
              : "date"
        }
        min={field === "durationDays" ? 0 : undefined}
        value={draft}
        className="h-7 min-w-0 rounded-sm px-1 text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft !== value) onSave(row.activity!, field, draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        aria-label={`ویرایش ${field}`}
      />
    );
  }
  return (
    <button
      type="button"
      className="w-full truncate rounded-sm px-1 text-inherit outline-none hover:bg-[var(--schedule-accent)]/10 focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)]"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

function TaskGrid({
  rows,
  selectedId,
  onSelect,
  onToggle,
  onSave,
  readOnly = false,
}: Pick<
  ScheduleWorkspaceProps,
  "rows" | "selectedId" | "onSelect" | "onToggle" | "onSave" | "readOnly"
>) {
  return (
    <div
      className="min-w-[650px] bg-[var(--schedule-surface-0)]"
      role="grid"
      aria-label="جدول فعالیت‌های زمان‌بندی"
    >
      <GridHeader />
      {rows.map((row) => {
        const activity = row.activity;
        const selected = row.id === selectedId;
        return (
          <div
            key={row.id}
            role="row"
            aria-selected={selected}
            className={`grid h-9 grid-cols-[72px_minmax(180px,1fr)_58px_92px_92px_76px_54px] items-center border-b border-[var(--schedule-border)]/60 px-2 text-xs text-[var(--schedule-text-body)] transition-colors hover:bg-[var(--schedule-accent)]/7 ${row.kind === "summary" ? "bg-[var(--schedule-surface-2)]/75 font-semibold" : ""}`}
            onClick={() => onSelect(row)}
          >
            <span
              dir="ltr"
              className="truncate text-left font-mono text-[var(--schedule-text-muted)]"
            >
              {row.code}
            </span>
            <span
              className="flex min-w-0 items-center gap-1"
              style={{ paddingRight: row.level * 16 }}
            >
              {row.kind === "summary" ? (
                <button
                  type="button"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-[var(--schedule-accent)]/15 focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)]"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (row.wbsId) onToggle(row.wbsId);
                  }}
                  aria-label={`باز و بسته کردن ${row.name}`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              <EditableCell
                row={row}
                field="name"
                value={row.name}
                onSave={onSave}
                readOnly={readOnly}
              />
            </span>
            <span className="text-center font-mono">
              {row.kind === "summary" ? (
                (row.durationDays ?? "—")
              ) : (
                <EditableCell
                  row={row}
                  field="durationDays"
                  value={String(row.durationDays ?? 0)}
                  onSave={onSave}
                  readOnly={readOnly}
                />
              )}
            </span>
            <span className="text-center font-mono text-[10px]">
              {row.kind === "summary" ? (
                row.start ? (
                  formatJalali(row.start)
                ) : (
                  "—"
                )
              ) : (
                <EditableCell
                  row={row}
                  field="plannedStart"
                  value={row.start ?? ""}
                  onSave={onSave}
                  readOnly={readOnly}
                />
              )}
            </span>
            <span className="text-center font-mono text-[10px]">
              {row.kind === "summary" ? (
                row.finish ? (
                  formatJalali(row.finish)
                ) : (
                  "—"
                )
              ) : (
                <EditableCell
                  row={row}
                  field="plannedFinish"
                  value={row.finish ?? ""}
                  onSave={onSave}
                  readOnly={readOnly}
                />
              )}
            </span>
            <span
              dir="ltr"
              className="truncate text-center font-mono text-[10px] text-[var(--schedule-text-muted)]"
            >
              {row.predecessor ?? "—"}
            </span>
            <span
              className="text-center font-mono text-[var(--schedule-text-muted)]"
              title="در مدل فعلی وزن فعالیت ذخیره نمی‌شود"
            >
              {row.weight}
            </span>
            {activity ? (
              <span className="sr-only">وضعیت: {activity.status}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ResizeDivider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (event: PointerEvent) => {
      onChange(Math.min(52, Math.max(32, value - event.movementX / 12)));
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, onChange, value]);

  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={32}
      aria-valuemax={52}
      aria-valuenow={value}
      aria-label="تغییر عرض جدول فعالیت‌ها"
      className="group relative z-50 flex w-2 shrink-0 cursor-col-resize items-center justify-center border-x border-[var(--schedule-border)] bg-[var(--schedule-surface-1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)]"
      onPointerDown={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(Math.min(52, value + 2));
        if (event.key === "ArrowRight") onChange(Math.max(32, value - 2));
      }}
    >
      <GripVertical className="h-4 w-4 text-[var(--schedule-text-muted)] transition-colors group-hover:text-[var(--schedule-accent)]" />
    </button>
  );
}

function TaskDetailsSheet({
  row,
  open,
  onOpenChange,
  dependencies,
}: {
  row: ScheduleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies: ScheduleDependency[];
}) {
  const activity = row?.activity;
  const predecessorCount = activity
    ? dependencies.filter(
        (dependency) => dependency.successorId === activity.id,
      ).length
    : 0;
  const successorCount = activity
    ? dependencies.filter(
        (dependency) => dependency.predecessorId === activity.id,
      ).length
    : 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        dir="rtl"
      >
        <SheetHeader className="text-right">
          <SheetTitle>
            {activity?.name ?? row?.name ?? "جزئیات فعالیت"}
          </SheetTitle>
          <SheetDescription>
            {activity
              ? `کد ${activity.code} · فعالیت ${activity.activityType === "milestone" ? "نقطه عطف" : "عادی"}`
              : "خلاصه WBS"}
          </SheetDescription>
        </SheetHeader>
        {row && (
          <div className="mt-6 space-y-3 text-sm">
            <Detail label="WBS" value={row.code} ltr />
            <Detail
              label="شروع"
              value={row.start ? formatJalali(row.start, "d MMMM yyyy") : "—"}
            />
            <Detail
              label="پایان"
              value={row.finish ? formatJalali(row.finish, "d MMMM yyyy") : "—"}
            />
            <Detail
              label="مدت"
              value={
                row.durationDays !== undefined
                  ? `${persianNumber(row.durationDays)} روز`
                  : "—"
              }
            />
            {activity ? (
              <Detail
                label="وضعیت"
                value={
                  activity.status === "completed"
                    ? "تکمیل شده"
                    : activity.status === "in_progress"
                      ? "در حال انجام"
                      : "شروع نشده"
                }
              />
            ) : null}
            {activity ? (
              <Detail
                label="وابستگی‌ها"
                value={`${persianNumber(predecessorCount)} پیش‌نیاز · ${persianNumber(successorCount)} پس‌نیاز`}
              />
            ) : null}
            <div className="mt-6 rounded-lg border border-[var(--schedule-border)] bg-[var(--schedule-surface-1)] p-3 text-xs text-[var(--schedule-text-muted)]">
              <Info className="mb-2 h-4 w-4 text-[var(--schedule-accent)]" />
              تغییر تاریخ و مدت از سلول‌های جدول یا با کشیدن نوار در حالت دستی
              انجام می‌شود.
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--schedule-border)]/60 py-2">
      <span className="text-[var(--schedule-text-muted)]">{label}</span>
      <strong dir={ltr ? "ltr" : undefined}>{value}</strong>
    </div>
  );
}

function CalendarPreview({
  rows,
  onOpenCalendar,
}: {
  rows: ScheduleRow[];
  onOpenCalendar: () => void;
}) {
  const activities = rows.filter(
    (row) => row.kind === "activity" && row.activity && row.start && row.finish,
  );
  const range = activities[0]?.start;
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const days = useMemo(() => {
    if (!range) return [];
    const monthStart = jalaliMonthStart(range);
    const offset = (new Date(`${monthStart}T00:00:00Z`).getUTCDay() + 1) % 7;
    return Array.from({ length: 42 }, (_, index) =>
      addDays(monthStart, index - offset),
    );
  }, [range]);
  if (!range) return null;
  return (
    <section
      className="rounded-xl border border-[var(--schedule-border)] bg-[var(--schedule-surface-0)]"
      aria-label="تقویم ماهانه شمسی"
    >
      <div className="flex items-center justify-between border-b border-[var(--schedule-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[var(--schedule-accent)]" />
          <h2 className="text-sm font-semibold">نمای تقویمی</h2>
          <span className="text-xs text-[var(--schedule-text-muted)]">
            فقط خواندنی
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenCalendar}>
          تقویم کاری
        </Button>
      </div>
      <div className="grid grid-cols-7 border-b border-[var(--schedule-border)] text-center text-[10px] text-[var(--schedule-text-muted)]">
        {[
          "شنبه",
          "یکشنبه",
          "دوشنبه",
          "سه‌شنبه",
          "چهارشنبه",
          "پنجشنبه",
          "جمعه",
        ].map((day) => (
          <span key={day} className="py-2">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayActivities = activities.filter(
            (row) => row.start! <= day && row.finish! >= day,
          );
          const visible =
            expandedDay === day ? dayActivities : dayActivities.slice(0, 3);
          return (
            <div
              key={day}
              className="min-h-24 border-b border-l border-[var(--schedule-border)]/50 p-1.5 text-right last:border-l-0"
            >
              <span className="text-[10px] text-[var(--schedule-text-muted)]">
                {formatJalali(day, "d")}
              </span>
              <div className="mt-1 space-y-1">
                {visible.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className="block w-full truncate rounded bg-[var(--schedule-accent)]/18 px-1.5 py-0.5 text-right text-[10px] text-[var(--schedule-accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)]"
                    title={row.name}
                  >
                    {row.name}
                  </button>
                ))}
                {dayActivities.length > 3 && (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-[var(--schedule-accent-strong)]"
                    onClick={() =>
                      setExpandedDay(expandedDay === day ? null : day)
                    }
                  >
                    +{persianNumber(dayActivities.length - 3)} مورد دیگر
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ScheduleWorkspace({
  rows,
  activities,
  dependencies,
  scale,
  selectedId,
  onSelect,
  onToggle,
  onToggleAll,
  onSave,
  onShift,
  onResize,
  onOpenCalendar,
  readOnly = false,
}: ScheduleWorkspaceProps) {
  const [gridWidth, setGridWidth] = useState(40);
  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (selectedId) setSheetOpen(true);
  }, [selectedId]);

  return (
    <div className="schedule-workspace space-y-4" dir="rtl">
      <div className="rounded-xl border border-[var(--schedule-border)] bg-[var(--schedule-surface-0)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--schedule-border)] px-3 py-2">
          <div className="flex items-center gap-1 text-xs text-[var(--schedule-text-muted)]">
            <PanelRight className="h-3.5 w-3.5" />
            {persianNumber(activities.length)} فعالیت ·{" "}
            {persianNumber(dependencies.length)} وابستگی
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onToggleAll(true)}>
              <ChevronsDown className="h-3.5 w-3.5" />
              باز کردن همه
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleAll(false)}
            >
              <ChevronsUp className="h-3.5 w-3.5" />
              بستن همه
            </Button>
          </div>
        </div>
        <div className="max-h-[min(64vh,680px)] min-h-[480px] overflow-y-auto overflow-x-hidden">
          <div className="flex min-w-[1200px]" style={{ direction: "rtl" }}>
            <div
              style={{ width: `${gridWidth}%` }}
              className="shrink-0 border-l border-[var(--schedule-border)]"
            >
              <TaskGrid
                rows={rows}
                selectedId={selectedId}
                onSelect={onSelect}
                onToggle={onToggle}
                onSave={onSave}
                readOnly={readOnly}
              />
            </div>
            <ResizeDivider value={gridWidth} onChange={setGridWidth} />
            <div className="min-w-0 flex-1">
              <GanttChart
                rows={rows}
                dependencies={dependencies}
                scale={scale}
                selectedId={selectedId}
                onSelect={onSelect}
                onShift={onShift}
                onResize={onResize}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      </div>
      <CalendarPreview rows={rows} onOpenCalendar={onOpenCalendar} />
      <TaskDetailsSheet
        row={selectedRow}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        dependencies={dependencies}
      />
    </div>
  );
}

export type { EditableField };
