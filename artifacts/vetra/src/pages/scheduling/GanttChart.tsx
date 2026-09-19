import { useEffect, useMemo, useRef, useState } from "react";
import { formatJalali, persianNumber } from "@/lib/jalali";
import type { PlanningActivity } from "@workspace/api-client-react";
import {
  addDays,
  buildScaleTicks,
  daysBetween,
  formatScaleLabel,
  formatSubScaleLabel,
  getScheduleRange,
  inclusiveDuration,
  scaleToPixelsPerDay,
  type ScheduleDependency,
  type ScheduleRow,
  type ScheduleScale,
} from "./schedule-utils";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 20;

type DragState = {
  activity: PlanningActivity;
  mode: "move" | "resize";
  originX: number;
  deltaDays: number;
};

type GanttChartProps = {
  rows: ScheduleRow[];
  dependencies: ScheduleDependency[];
  scale: ScheduleScale;
  selectedId: string | null;
  onSelect: (row: ScheduleRow) => void;
  onShift: (activity: PlanningActivity, deltaDays: number) => void;
  onResize: (activity: PlanningActivity, deltaDays: number) => void;
  readOnly?: boolean;
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "var(--schedule-accent)",
  in_progress: "#3b82f6",
  completed: "var(--schedule-success)",
};

const DEPENDENCY_COLORS: Record<string, string> = {
  FS: "var(--schedule-text-muted)",
  SS: "#8b5cf6",
  FF: "var(--schedule-accent)",
  SF: "var(--schedule-danger)",
};

function activityLabel(activity: PlanningActivity): string {
  return `${activity.name}، شروع ${formatJalali(activity.plannedStart)}، پایان ${formatJalali(activity.plannedFinish)}، مدت ${persianNumber(activity.durationDays)} روز`;
}

export default function GanttChart({
  rows,
  dependencies,
  scale,
  selectedId,
  onSelect,
  onShift,
  onResize,
  readOnly = false,
}: GanttChartProps) {
  const range = useMemo(() => getScheduleRange(rows), [rows]);
  const pixelsPerDay = scaleToPixelsPerDay(scale);
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const ticks = useMemo(
    () => (range ? buildScaleTicks(range, scale) : []),
    [range, scale],
  );
  const totalDays = range
    ? Math.max(1, daysBetween(range.start, range.finish) + 1)
    : 1;
  const contentWidth = Math.max(900, totalDays * pixelsPerDay);
  const activityRows = useMemo(
    () =>
      new Map(
        rows.flatMap((row, index) =>
          row.kind === "activity" && row.activity
            ? [[row.activity.id, { row, index }] as const]
            : [],
        ),
      ),
    [rows],
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const deltaDays = Math.round(
        (event.clientX - current.originX) / pixelsPerDay,
      );
      dragRef.current = { ...current, deltaDays };
    };
    const handleUp = () => {
      const current = dragRef.current;
      if (current && current.deltaDays !== 0) {
        if (current.mode === "move")
          onShift(current.activity, current.deltaDays);
        else onResize(current.activity, current.deltaDays);
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [onResize, onShift, pixelsPerDay]);

  const dateToX = (date: string) =>
    range ? daysBetween(range.start, date) * pixelsPerDay : 0;
  const rowY = (index: number) => HEADER_HEIGHT + index * ROW_HEIGHT;
  if (!range) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--schedule-text-muted)]">
        زمانی برای نمایش وجود ندارد.
      </div>
    );
  }

  return (
    <div ref={chartRef} className="h-full min-w-0 overflow-x-auto" dir="ltr">
      <div
        className="relative"
        style={{ width: contentWidth, minWidth: "100%" }}
      >
        <div className="sticky top-0 z-20 border-b border-[var(--schedule-border)] bg-[var(--schedule-surface-1)]/95 backdrop-blur">
          <div
            className="relative"
            style={{ height: HEADER_HEIGHT }}
            aria-label="مقیاس زمانی شمسی"
          >
            {ticks.map((tick, index) => {
              const x = dateToX(tick);
              const next = ticks[index + 1] ?? range.finish;
              const width = Math.max(
                1,
                (daysBetween(tick, next) || 1) * pixelsPerDay,
              );
              return (
                <div
                  key={tick}
                  className="absolute inset-y-0 border-l border-[var(--schedule-border)]/70 px-2 text-center"
                  style={{ left: x, width }}
                >
                  <div className="pt-2 text-[11px] font-semibold text-[var(--schedule-text-body)]">
                    {formatScaleLabel(tick, scale)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--schedule-text-muted)]">
                    {formatSubScaleLabel(tick, scale)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10"
          style={{ height: HEADER_HEIGHT + rows.length * ROW_HEIGHT }}
        >
          {ticks.map((tick) => (
            <span
              key={`grid-${tick}`}
              className="absolute inset-y-0 border-l border-[var(--schedule-border)]/35"
              style={{ left: dateToX(tick) }}
            />
          ))}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            if (today < range.start || today > range.finish) return null;
            return (
              <span
                className="absolute bottom-0 top-0 w-px bg-[var(--schedule-danger)]/80"
                style={{ left: dateToX(today) }}
                aria-hidden="true"
              />
            );
          })()}
        </div>

        <svg
          className="pointer-events-none absolute left-0 top-0 z-30"
          width={contentWidth}
          height={HEADER_HEIGHT + rows.length * ROW_HEIGHT}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="schedule-arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
            </marker>
          </defs>
          {dependencies.map((dependency) => {
            const predecessor = activityRows.get(dependency.predecessorId);
            const successor = activityRows.get(dependency.successorId);
            if (!predecessor || !successor) return null;
            const predecessorActivity = predecessor.row.activity!;
            const successorActivity = successor.row.activity!;
            const fromStart =
              dependency.dependencyType === "SS" ||
              dependency.dependencyType === "SF";
            const toStart =
              dependency.dependencyType === "SS" ||
              dependency.dependencyType === "FS";
            const fromX = dateToX(
              fromStart
                ? predecessorActivity.plannedStart
                : predecessorActivity.plannedFinish,
            );
            const toX = dateToX(
              toStart
                ? successorActivity.plannedStart
                : successorActivity.plannedFinish,
            );
            const fromY = rowY(predecessor.index) + ROW_HEIGHT / 2;
            const toY = rowY(successor.index) + ROW_HEIGHT / 2;
            const elbowX = fromX + (toX >= fromX ? 14 : -14);
            const isRelated =
              hoveredId === dependency.predecessorId ||
              hoveredId === dependency.successorId;
            const color =
              DEPENDENCY_COLORS[dependency.dependencyType] ??
              "var(--schedule-text-muted)";
            return (
              <path
                key={dependency.id}
                d={`M ${fromX} ${fromY} L ${elbowX} ${fromY} L ${elbowX} ${toY} L ${toX} ${toY}`}
                fill="none"
                stroke={color}
                strokeWidth={isRelated ? 2 : 1}
                strokeOpacity={hoveredId && !isRelated ? 0.12 : 0.62}
                markerEnd="url(#schedule-arrowhead)"
                className="transition-all"
              />
            );
          })}
        </svg>

        <div className="relative z-40">
          {rows.map((row, index) => {
            if (!row.start || !row.finish)
              return (
                <div
                  key={row.id}
                  style={{ height: ROW_HEIGHT }}
                  className="border-b border-[var(--schedule-border)]/50"
                />
              );
            const startX = dateToX(row.start);
            const endX = dateToX(row.finish) + pixelsPerDay;
            const width = Math.max(
              row.kind === "summary" ? 12 : 8,
              endX - startX,
            );
            const activity = row.activity;
            const isSelected = selectedId === row.id;
            if (row.kind === "summary") {
              return (
                <div
                  key={row.id}
                  className="relative border-b border-[var(--schedule-border)]/50"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="absolute top-[10px] h-3 border-t-2 border-[var(--schedule-text-body)]/75"
                    style={{ left: startX, width }}
                  >
                    <span className="absolute left-0 top-0 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--schedule-text-body)]/75" />
                    <span className="absolute right-0 top-0 h-2 w-2 -translate-y-1/2 rotate-45 bg-[var(--schedule-text-body)]/75" />
                  </div>
                </div>
              );
            }
            if (!activity) return null;
            const color =
              STATUS_COLORS[activity.status] ?? "var(--schedule-accent)";
            const completed = activity.status === "completed";
            const isMilestone =
              activity.activityType === "milestone" ||
              activity.durationDays === 0;
            return (
              <div
                key={row.id}
                className={`relative border-b border-[var(--schedule-border)]/50 ${isSelected ? "bg-[var(--schedule-accent)]/8" : ""}`}
                style={{ height: ROW_HEIGHT }}
              >
                {isMilestone ? (
                  <button
                    type="button"
                    aria-label={activityLabel(activity)}
                    className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-2 border-[var(--schedule-surface-0)] bg-[var(--schedule-accent)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)]"
                    style={{ left: startX - 8 }}
                    onClick={() => onSelect(row)}
                    onMouseEnter={() => setHoveredId(activity.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={activityLabel(activity)}
                    className={`group absolute top-1/2 -translate-y-1/2 cursor-pointer rounded-[2px] border border-black/10 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--schedule-accent)] ${isSelected ? "ring-2 ring-[var(--schedule-accent)]/70" : ""}`}
                    style={{
                      left: startX,
                      width,
                      height: BAR_HEIGHT,
                      backgroundColor: "transparent",
                      borderColor: color,
                    }}
                    onClick={() => onSelect(row)}
                    onMouseEnter={() => setHoveredId(activity.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ")
                        onSelect(row);
                    }}
                    onPointerDown={(event) => {
                      if (readOnly || event.button !== 0) return;
                      event.preventDefault();
                      const nearEnd =
                        event.clientX >=
                        event.currentTarget.getBoundingClientRect().right - 10;
                      const nextDrag = {
                        activity,
                        mode: nearEnd ? "resize" : "move",
                        originX: event.clientX,
                        deltaDays: 0,
                      } as DragState;
                      dragRef.current = nextDrag;
                    }}
                  >
                    <span
                      className="absolute inset-0 rounded-[2px]"
                      style={{ backgroundColor: color, opacity: 0.18 }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-[2px]"
                      style={{
                        width: completed ? "100%" : 0,
                        backgroundColor: color,
                        opacity: 0.5,
                      }}
                    />
                    <span className="relative z-10 block truncate px-1 text-[10px] font-medium leading-5 text-[var(--schedule-text-body)]">
                      {width > 70
                        ? `${formatJalali(activity.plannedStart, "d MMM")} · ${persianNumber(activity.durationDays)} روز`
                        : ""}
                    </span>
                    {!readOnly && (
                      <span
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
                <span
                  className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] text-[var(--schedule-text-muted)]"
                  style={{ left: startX + width + 6 }}
                  aria-hidden="true"
                >
                  {formatJalali(activity.plannedFinish, "d MMM")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { addDays, inclusiveDuration };
