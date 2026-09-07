import { useMemo, useRef, useState, useCallback } from 'react';
import { formatJalali, persianNumber } from '@/lib/jalali';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActivityBar {
  id: number;
  code: string;
  name: string;
  wbsId: number;
  plannedStart: string;
  plannedFinish: string;
  durationDays: number;
  status: string;
  activityType: string;
  calendarStart?: string;
  calendarFinish?: string;
  isCritical: boolean;
  progressPercent?: number;
}

interface DependencyEdge {
  id: number;
  predecessorId: number;
  successorId: number;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

interface WbsItem {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  sortOrder: number;
}

interface GanttChartProps {
  activities: ActivityBar[];
  dependencies: DependencyEdge[];
  wbsItems: WbsItem[];
  loading: boolean;
  error: string | null;
  projectStartDate?: string;
  calendarAdjusted?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROW_HEIGHT = 36;
const GROUP_HEADER_HEIGHT = 32;
const LEFT_COL_WIDTH = 260;
const HEADER_HEIGHT = 44;
const BAR_HEIGHT = 20;
const BAR_RADIUS = 4;
const PADDING_DAYS = 2;
const MIN_CHART_WIDTH = 600;

const STATUS_COLORS: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
};

const DEPENDENCY_COLORS: Record<string, string> = {
  FS: '#64748b',
  SS: '#8b5cf6',
  FF: '#f59e0b',
  SF: '#ef4444',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDate(d: string): Date {
  return new Date(d + 'T00:00:00Z');
}

function daysBetween(a: string, b: string): number {
  return Math.ceil((parseDate(b).getTime() - parseDate(a).getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: string, days: number): string {
  const date = parseDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function buildWbsTree(items: WbsItem[]): Map<number, WbsItem[]> {
  const map = new Map<number, WbsItem[]>();
  const roots: WbsItem[] = [];
  const byId = new Map<number, WbsItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  for (const item of items) {
    if (item.parentId != null && byId.has(item.parentId)) {
      const children = map.get(item.parentId) || [];
      children.push(item);
      map.set(item.parentId, children);
    } else {
      roots.push(item);
    }
  }
  // Sort each group
  for (const [, children] of map) {
    children.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }
  roots.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  return map;
}

function getWbsLeaves(items: WbsItem[]): WbsItem[] {
  const parentIds = new Set<number>();
  for (const item of items) {
    if (item.parentId != null) parentIds.add(item.parentId);
  }
  return items.filter((item) => !parentIds.has(item.id));
}

// ─── Tooltip Component ──────────────────────────────────────────────────────

function Tooltip({ x, y, activity, visible }: { x: number; y: number; activity: ActivityBar | null; visible: boolean }) {
  if (!visible || !activity) return null;
  return (
    <g transform={`translate(${x}, ${y})`} className="pointer-events-none">
      <rect x={-120} y={-50} width={240} height={50} rx={6} fill="#1e293b" stroke="#475569" strokeWidth={1} opacity={0.95} />
      <text x={-110} y={-32} fill="#f8fafc" fontSize={12} fontWeight={600} fontFamily="system-ui" textAnchor="start">
        {activity.code}: {activity.name}
      </text>
      <text x={-110} y={-16} fill="#94a3b8" fontSize={11} fontFamily="system-ui" textAnchor="start">
        {formatJalali(activity.plannedStart)} → {formatJalali(activity.plannedFinish)}
        {activity.durationDays > 0 ? ` (${persianNumber(activity.durationDays)} روز)` : ''}
      </text>
    </g>
  );
}

// ─── Dependency Arrow ───────────────────────────────────────────────────────

function DependencyArrow({
  dep,
  activityMap,
  activityIndexMap,
  dayToX,
  minDate,
}: {
  dep: DependencyEdge;
  activityMap: Map<number, ActivityBar>;
  activityIndexMap: Map<number, number>;
  dayToX: (date: string) => number;
  minDate: string;
}) {
  const pred = activityMap.get(dep.predecessorId);
  const succ = activityMap.get(dep.successorId);
  if (!pred || !succ) return null;

  const predIdx = activityIndexMap.get(dep.predecessorId);
  const succIdx = activityIndexMap.get(dep.successorId);
  if (predIdx === undefined || succIdx === undefined) return null;

  const predY = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
  const succY = succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

  let fromX: number;
  let toX: number;

  switch (dep.dependencyType) {
    case 'FS':
      fromX = dayToX(pred.plannedFinish);
      toX = dayToX(succ.plannedStart);
      break;
    case 'SS':
      fromX = dayToX(pred.plannedStart);
      toX = dayToX(succ.plannedStart);
      break;
    case 'FF':
      fromX = dayToX(pred.plannedFinish);
      toX = dayToX(succ.plannedFinish);
      break;
    case 'SF':
      fromX = dayToX(pred.plannedStart);
      toX = dayToX(succ.plannedFinish);
      break;
  }

  const color = DEPENDENCY_COLORS[dep.dependencyType] || '#64748b';
  const midX = (fromX + toX) / 2;

  // Draw a simple path: fromX -> midX horizontally, then down/up, then toX
  const pathD = [
    `M ${fromX} ${predY}`,
    `L ${fromX + 10} ${predY}`,
    `L ${fromX + 10} ${succY}`,
    `L ${toX - 10} ${succY}`,
    `L ${toX} ${succY}`,
  ].join(' ');

  // Arrowhead
  const arrowSize = 5;
  const arrowD = [
    `M ${toX} ${succY}`,
    `L ${toX - arrowSize} ${succY - arrowSize / 2}`,
    `L ${toX - arrowSize} ${succY + arrowSize / 2}`,
    'Z',
  ].join(' ');

  return (
    <g>
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.7} />
      <path d={arrowD} fill={color} stroke={color} strokeWidth={1} />
    </g>
  );
}

// ─── Main GanttChart Component ──────────────────────────────────────────────

export default function GanttChart({
  activities,
  dependencies,
  wbsItems,
  loading,
  error,
  projectStartDate,
  calendarAdjusted,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredActivity, setHoveredActivity] = useState<ActivityBar | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback((activity: ActivityBar, e: React.MouseEvent) => {
    setHoveredActivity(activity);
    setTooltipPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredActivity(null);
  }, []);

  // Build WBS tree and assign activities to WBS nodes
  const { rowData, totalHeight, minDate, maxDate, totalDays } = useMemo(() => {
    if (activities.length === 0) {
      return { rowData: [] as { type: 'activity'; activity: ActivityBar; index: number }[], totalHeight: 0, minDate: '', maxDate: '', totalDays: 0 };
    }

    const wbsTree = buildWbsTree(wbsItems);
    const wbsById = new Map(wbsItems.map((w) => [w.id, w]));

    // Group activities by WBS
    const wbsActivities = new Map<number, ActivityBar[]>();
    const ungrouped: ActivityBar[] = [];
    for (const act of activities) {
      if (act.wbsId && wbsById.has(act.wbsId)) {
        const list = wbsActivities.get(act.wbsId) || [];
        list.push(act);
        wbsActivities.set(act.wbsId, list);
      } else {
        ungrouped.push(act);
      }
    }

    // Sort activities within each WBS by start date
    for (const [, acts] of wbsActivities) {
      acts.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.code.localeCompare(b.code));
    }
    ungrouped.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.code.localeCompare(b.code));

    // Build rows with WBS group headers
    const rows: { type: 'group' | 'activity'; wbsId?: number; wbsName?: string; wbsCode?: string; activity?: ActivityBar; index: number }[] = [];

    // Process WBS items in tree order
    const processedWbs = new Set<number>();
    function addWbsGroup(wbsId: number) {
      if (processedWbs.has(wbsId)) return;
      processedWbs.add(wbsId);
      const wbs = wbsById.get(wbsId);
      if (!wbs) return;
      const acts = wbsActivities.get(wbsId);
      if (acts && acts.length > 0) {
        rows.push({ type: 'group', wbsId, wbsName: wbs.name, wbsCode: wbs.code, index: 0 });
        for (const act of acts) {
          rows.push({ type: 'activity', activity: act, index: 0 });
        }
      }
      // Process children
      const children = wbsTree.get(wbsId) || [];
      for (const child of children) {
        addWbsGroup(child.id);
      }
    }

    // Start with root WBS items
    const roots = wbsItems.filter((w) => w.parentId == null || !wbsById.has(w.parentId));
    roots.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    for (const root of roots) {
      addWbsGroup(root.id);
    }

    // Add ungrouped activities
    if (ungrouped.length > 0) {
      rows.push({ type: 'group', wbsName: 'سایر', wbsCode: '—', index: 0 });
      for (const act of ungrouped) {
        rows.push({ type: 'activity', activity: act, index: 0 });
      }
    }

    // Calculate date range
    let min = activities[0].plannedStart;
    let max = activities[0].plannedFinish;
    for (const act of activities) {
      if (act.plannedStart < min) min = act.plannedStart;
      if (act.plannedFinish > max) max = act.plannedFinish;
    }

    // Add padding
    const paddedMin = addDays(min, -PADDING_DAYS);
    const paddedMax = addDays(max, PADDING_DAYS + 1);
    const days = daysBetween(paddedMin, paddedMax);

    // Calculate total height
    let h = HEADER_HEIGHT;
    for (const row of rows) {
      h += row.type === 'group' ? GROUP_HEADER_HEIGHT : ROW_HEIGHT;
    }

    return { rowData: rows, totalHeight: h, minDate: paddedMin, maxDate: paddedMax, totalDays: days };
  }, [activities, wbsItems]);

  // Build lookup maps
  const activityMap = useMemo(() => {
    const map = new Map<number, ActivityBar>();
    for (const act of activities) map.set(act.id, act);
    return map;
  }, [activities]);

  const activityIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    let idx = 0;
    for (const row of rowData) {
      if (row.type === 'activity' && row.activity) {
        map.set(row.activity.id, idx);
      }
      idx++;
    }
    return map;
  }, [rowData]);

  // Day-to-pixel mapping
  const dayToX = useCallback(
    (date: string) => {
      const d = daysBetween(minDate, date);
      return (d / totalDays) * MIN_CHART_WIDTH;
    },
    [minDate, totalDays],
  );

  // Generate date labels for header
  const dateLabels = useMemo(() => {
    if (totalDays === 0) return [];
    const labels: { date: string; x: number }[] = [];
    const step = Math.max(1, Math.floor(totalDays / 8));
    for (let i = 0; i <= totalDays; i += step) {
      const date = addDays(minDate, i);
      labels.push({ date, x: dayToX(date) });
    }
    if (labels.length > 0 && labels[labels.length - 1].date !== maxDate) {
      labels.push({ date: maxDate, x: dayToX(maxDate) });
    }
    return labels;
  }, [minDate, maxDate, totalDays, dayToX]);

  // ─── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
        <span className="mr-3 text-muted-foreground">در حال بارگذاری نمودار گانت...</span>
      </div>
    );
  }

  // ─── Error State ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        <span>خطا در بارگذاری داده‌های زمانبندی: {error}</span>
      </div>
    );
  }

  // ─── Empty State ──────────────────────────────────────────────────────────

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
          <rect x="10" y="11" width="4" height="3" rx="0.5" />
          <rect x="15" y="14" width="4" height="3" rx="0.5" />
        </svg>
        <span className="text-sm">فعالیتی برای نمایش در نمودار گانت وجود ندارد.</span>
        <span className="text-xs">ابتدا فعالیت‌ها و تقویم پروژه را از بخش مدیریت فعالیت‌ها تعریف کنید.</span>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  let currentY = HEADER_HEIGHT;
  const rowYPositions: number[] = [];

  return (
    <div className="rounded-lg border bg-card shadow-sm" dir="rtl">
      {/* Header info bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">نمودار گانت پروژه</h3>
          {calendarAdjusted && (
            <Badge variant="outline" className="text-xs">تقویم پروژه اعمال شده</Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{persianNumber(activities.length)} فعالیت</span>
          <span>{persianNumber(dependencies.length)} وابستگی</span>
          {projectStartDate && (
            <span>شروع: {formatJalali(projectStartDate)}</span>
          )}
        </div>
      </div>

      {/* Chart container */}
      <div className="overflow-x-auto" ref={containerRef}>
        <div className="flex" style={{ minWidth: LEFT_COL_WIDTH + MIN_CHART_WIDTH + 40 }}>
          {/* Left column: activity names */}
          <div className="flex-shrink-0 border-l" style={{ width: LEFT_COL_WIDTH }}>
            {/* Header */}
            <div className="flex items-center px-3 border-b bg-muted/30 font-semibold text-sm" style={{ height: HEADER_HEIGHT }}>
              نام فعالیت
            </div>
            {/* Rows */}
            {rowData.map((row, i) => {
              if (row.type === 'group') {
                return (
                  <div
                    key={`group-${i}`}
                    className="flex items-center px-3 border-b bg-muted/20 text-sm font-medium text-muted-foreground"
                    style={{ height: GROUP_HEADER_HEIGHT }}
                  >
                    {row.wbsCode && <span className="font-mono text-xs ml-2">{row.wbsCode}</span>}
                    <span className="truncate">{row.wbsName}</span>
                  </div>
                );
              }
              const act = row.activity!;
              return (
                <div
                  key={`act-${act.id}`}
                  className="flex items-center px-3 border-b text-sm"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="font-mono text-xs text-muted-foreground ml-2 truncate max-w-[80px]" dir="ltr">
                    {act.code}
                  </span>
                  <span className="truncate flex-1">{act.name}</span>
                </div>
              );
            })}
          </div>

          {/* Right column: SVG Gantt chart */}
          <div className="flex-1 overflow-x-auto" style={{ minWidth: MIN_CHART_WIDTH }}>
            <svg
              width={MIN_CHART_WIDTH}
              height={totalHeight}
              className="block"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Background grid lines */}
              {dateLabels.map((label, i) => (
                <line
                  key={`grid-${i}`}
                  x1={label.x}
                  y1={HEADER_HEIGHT}
                  x2={label.x}
                  y2={totalHeight}
                  stroke={i % 2 === 0 ? '#e2e8f0' : '#f1f5f9'}
                  strokeWidth={1}
                />
              ))}

              {/* Header */}
              <rect x={0} y={0} width={MIN_CHART_WIDTH} height={HEADER_HEIGHT} fill="#f8fafc" />
              {dateLabels.map((label, i) => (
                <text
                  key={`hdr-${i}`}
                  x={label.x}
                  y={HEADER_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize={11}
                  fontFamily="system-ui"
                >
                  {formatJalali(label.date, 'yyyy/MM/dd')}
                </text>
              ))}
              <line x1={0} y1={HEADER_HEIGHT} x2={MIN_CHART_WIDTH} y2={HEADER_HEIGHT} stroke="#cbd5e1" strokeWidth={1} />

              {/* Today line */}
              {(() => {
                const today = new Date().toISOString().split('T')[0];
                if (today >= minDate && today <= maxDate) {
                  const tx = dayToX(today);
                  return (
                    <line
                      x1={tx}
                      y1={HEADER_HEIGHT}
                      x2={tx}
                      y2={totalHeight}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      opacity={0.6}
                    />
                  );
                }
                return null;
              })()}

              {/* Rows */}
              {(() => {
                let y = HEADER_HEIGHT;
                const elements: React.ReactNode[] = [];

                for (const row of rowData) {
                  if (row.type === 'group') {
                    elements.push(
                      <rect key={`grp-bg-${y}`} x={0} y={y} width={MIN_CHART_WIDTH} height={GROUP_HEADER_HEIGHT} fill="#f1f5f9" fillOpacity={0.5} />,
                    );
                    elements.push(
                      <line key={`grp-line-${y}`} x1={0} y1={y + GROUP_HEADER_HEIGHT} x2={MIN_CHART_WIDTH} y2={y + GROUP_HEADER_HEIGHT} stroke="#e2e8f0" strokeWidth={1} />,
                    );
                    y += GROUP_HEADER_HEIGHT;
                  } else {
                    const act = row.activity!;
                    const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;

                    // Determine bar start/end using calendar dates if available, otherwise planned dates
                    const barStart = act.calendarStart || act.plannedStart;
                    const barFinish = act.calendarFinish || act.plannedFinish;
                    const barX = dayToX(barStart);
                    const barWidth = Math.max(4, dayToX(barFinish) - barX);

                    const isCritical = act.isCritical;
                    const isMilestone = act.activityType === 'milestone' || act.durationDays === 0;

                    // Bar color based on status and critical path
                    let barColor = STATUS_COLORS[act.status] || '#94a3b8';
                    if (isCritical) barColor = '#ef4444';

                    if (isMilestone) {
                      // Milestone: diamond shape
                      const mx = barX;
                      const my = y + ROW_HEIGHT / 2;
                      const diamondPath = [
                        `M ${mx} ${my - 8}`,
                        `L ${mx + 8} ${my}`,
                        `L ${mx} ${my + 8}`,
                        `L ${mx - 8} ${my}`,
                        'Z',
                      ].join(' ');
                      elements.push(
                        <g key={`ms-${act.id}`}>
                          <path d={diamondPath} fill={isCritical ? '#ef4444' : '#f59e0b'} stroke={isCritical ? '#b91c1c' : '#d97706'} strokeWidth={1} />
                        </g>,
                      );
                    } else {
                      // Activity bar
                      elements.push(
                        <g key={`bar-${act.id}`}>
                          {/* Background bar (planned) */}
                          <rect
                            x={barX}
                            y={barY}
                            width={barWidth}
                            height={BAR_HEIGHT}
                            rx={BAR_RADIUS}
                            fill={barColor}
                            fillOpacity={0.3}
                            stroke={barColor}
                            strokeWidth={1}
                            strokeOpacity={0.5}
                          />
                          {/* Progress bar if available */}
                          {act.progressPercent !== undefined && act.progressPercent > 0 && (
                            <rect
                              x={barX}
                              y={barY}
                              width={Math.max(2, (barWidth * act.progressPercent) / 100)}
                              height={BAR_HEIGHT}
                              rx={BAR_RADIUS}
                              fill={barColor}
                              fillOpacity={0.8}
                            />
                          )}
                          {/* Interactive hover area */}
                          <rect
                            x={barX}
                            y={barY}
                            width={barWidth}
                            height={BAR_HEIGHT}
                            rx={BAR_RADIUS}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={(e) => handleMouseEnter(act, e as any)}
                            onMouseMove={(e) => handleMouseMove(e as any)}
                          />
                          {/* Progress text */}
                          {act.progressPercent !== undefined && act.progressPercent > 0 && barWidth > 40 && (
                            <text
                              x={barX + barWidth / 2}
                              y={barY + BAR_HEIGHT / 2 + 4}
                              textAnchor="middle"
                              fill="#fff"
                              fontSize={10}
                              fontFamily="system-ui"
                              fontWeight={600}
                            >
                              {persianNumber(act.progressPercent)}%
                            </text>
                          )}
                        </g>,
                      );
                    }

                    // Row background
                    elements.push(
                      <line key={`row-line-${act.id}`} x1={0} y1={y + ROW_HEIGHT} x2={MIN_CHART_WIDTH} y2={y + ROW_HEIGHT} stroke="#f1f5f9" strokeWidth={1} />,
                    );
                    y += ROW_HEIGHT;
                  }
                }

                return elements;
              })()}

              {/* Dependency arrows */}
              {dependencies.map((dep) => (
                <DependencyArrow
                  key={`dep-${dep.id}`}
                  dep={dep}
                  activityMap={activityMap}
                  activityIndexMap={activityIndexMap}
                  dayToX={dayToX}
                  minDate={minDate}
                />
              ))}

              {/* Tooltip */}
              <Tooltip
                x={tooltipPos.x}
                y={tooltipPos.y}
                activity={hoveredActivity}
                visible={hoveredActivity !== null}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t text-xs text-muted-foreground">
        <span>راهنما:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> مسیر بحرانی
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> در حال انجام
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> تکمیل شده
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-slate-400" /> شروع نشده
        </span>
        <span className="flex items-center gap-1 mr-4">
          <span className="inline-block w-3 h-3 rotate-45 bg-amber-500" /> نقطه عطف
        </span>
      </div>
    </div>
  );
}
