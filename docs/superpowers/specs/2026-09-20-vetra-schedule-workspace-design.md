# VETRA Schedule Workspace Design

## Scope

Replace the current `/scheduling` screen implemented by `artifacts/vetra/src/pages/scheduling/SchedulingPage.tsx` with a Persian-first RTL schedule workspace. The existing scheduling API, tenant boundary, permissions, activity model, dependency model, calendar model, and CPM service remain the source of truth.

This is a UI and interaction redesign. It does not add resource assignment, cost or budget fields, baseline/slippage indicators, critical-path highlighting as a new feature, or a resource-sheet view.

## Current Architecture

- `SchedulingPage.tsx` manages calendars, dependencies, CPM results, and calendar-adjusted results in separate cards and forms.
- `GanttChart.tsx` contains an unused, monolithic SVG chart. It has activity bars and dependency lines but no inline editing, synchronized split panes, rescheduling, or detail sheet.
- `ActivityManagement.tsx` owns the existing activity CRUD flow and uses generated API hooks.
- Scheduling APIs are protected by `planning.read` and `planning.manage`, scope project resources by authenticated organization, validate inputs with Zod, and write audit events.
- `planning_activities` stores WBS membership, code, name, type, planned dates, duration, and status. It does not store weight percentage or schedule mode.
- Project calendar exceptions are available through the scheduling API. Date values are stored as ISO/Gregorian dates and formatted as Jalali only at the UI boundary.

## UX Goals

1. Put WBS rows, schedule dates, progress, and dependencies in one decision surface.
2. Preserve high information density without the legacy form-card fragmentation.
3. Make the right-side task grid and left-side time chart behave as one scrollable workspace.
4. Make manual schedule edits visible, reversible through error handling, and permission-aware.
5. Keep technical identifiers and date semantics correct while presenting Persian/Jalali labels.

## Design Direction

The workspace uses a restrained construction-control visual language: warm amber activity bars, neutral summary bands, thin engineering-grid lines, and a graphite dark theme. The one distinctive element is the split-pane schedule surface with a persistent today marker and dependency geometry, rather than decorative dashboard graphics.

### Layout

```text
RTL viewport
┌──────────────────────────────────────────────────────────────────────┐
│ Project header · Jalali start · Manual mode · Calendar · Zoom        │
├──────────────────────────────────────────────────────────────────────┤
│ Task grid (right, ~40%) │ draggable divider │ Timeline (left, ~60%)  │
│ WBS · activity · dates  │                  │ Jalali scale · bars    │
│ duration · predecessor  │                  │ progress · arrows      │
├──────────────────────────────────────────────────────────────────────┤
│ Read-only Jalali calendar view                                         │
└──────────────────────────────────────────────────────────────────────┘
```

The grid and timeline use a shared flattened row model. A vertical scroll controller keeps both panes aligned. The timeline has its own horizontal scroll container. The divider is keyboard accessible and clamps the grid between 32% and 52% of the available width.

## Component Boundaries

- `SchedulingPage`: loads the active project schedule, coordinates mutations and page-level states.
- `ScheduleHeader`: project identity, Jalali start display, manual mode indicator, calendar dialog trigger, and zoom controls.
- `ScheduleToolbar`: scale toggle, filter/search, expand/collapse, refresh, and permission-aware create action.
- `ScheduleWorkspace`: split-pane shell, divider, shared row model, and scroll synchronization.
- `TaskGrid`: semantic `role="grid"`, WBS hierarchy, inline editable cells, row selection, and keyboard navigation.
- `GanttTimeline`: Jalali month/week/day headers, grid lines, current-date marker, bars, milestone diamonds, summary brackets, and drag handles.
- `DependencyLayer`: SVG polylines for FS/SS/FF/SF edges, with hover filtering.
- `TaskDetailsSheet`: Radix Sheet with task metadata and the existing update contract.
- `WorkCalendarDialog`: Radix Dialog for existing calendar and exception flows.
- `ReadOnlyCalendarView`: derived month grid with task chips and overflow expansion; no edit controls.

## Data Flow

1. Read the active project from `useOrganizationProject`.
2. Fetch WBS and activities from `GET /projects/:projectId/wbs`.
3. Fetch dependencies from `GET /projects/:projectId/dependencies`.
4. Fetch CPM results from `GET /projects/:projectId/cpm` for existing analysis data and critical-path metadata.
5. Fetch project calendars and exceptions from the existing scheduling routes.
6. Build a view-only WBS tree and flattened row model. Summary rows are derived from WBS descendants; no summary records are inserted.
7. Format dates with `formatJalali` at the presentation boundary. Keep ISO dates for comparisons and mutations.
8. Commit inline edits and manual drag changes through the existing activity update contract. On failure, restore the previous row and show a non-modal toast.
9. Invalidate the WBS/activity query after a successful mutation and preserve the selected row when possible.

## Business and Data Constraints

- `سهم %` is not persisted in the current activity model. The column remains visible with an explicit unavailable state (`—`) and must not derive or present a fabricated business weight.
- Auto/manual schedule mode is not persisted and existing APIs do not recalculate or mutate dates automatically. The first version exposes manual editing as the real mode and presents CPM as read-only analysis. A true automatic mode requires a separately approved domain/API decision.
- Dragging a task changes planned dates and duration only in manual mode. It does not rewrite a baseline, progress record, calendar, or dependency definition.
- Milestones keep zero-duration semantics.
- Dependency type and lag are preserved as returned by the API. The UI does not silently reinterpret FS, SS, FF, or SF.
- Tenant, project ownership, RBAC, validation, database writes, and audit behavior remain server-owned.

## Visual Tokens

The schedule-specific variables are scoped to the workspace and layered over existing theme tokens:

```css
.schedule-workspace {
  --schedule-surface-0: oklch(98% 0.005 250);
  --schedule-surface-1: oklch(95% 0.008 250);
  --schedule-surface-2: oklch(91% 0.01 250);
  --schedule-border: oklch(82% 0.012 250);
  --schedule-text-muted: oklch(55% 0.015 250);
  --schedule-text-body: oklch(22% 0.02 250);
  --schedule-accent: oklch(62% 0.18 65);
  --schedule-accent-strong: oklch(42% 0.16 65);
  --schedule-success: oklch(60% 0.15 145);
  --schedule-danger: oklch(58% 0.2 25);
}

.dark .schedule-workspace {
  --schedule-surface-0: oklch(12% 0.015 250);
  --schedule-surface-1: oklch(15% 0.018 250);
  --schedule-surface-2: oklch(18% 0.02 250);
  --schedule-border: oklch(29% 0.02 250);
  --schedule-text-muted: oklch(68% 0.015 250);
  --schedule-text-body: oklch(93% 0.01 250);
  --schedule-accent: oklch(66% 0.15 65);
  --schedule-accent-strong: oklch(78% 0.12 65);
}
```

Typography uses the existing local Vazirmatn stack. Body sizes are 12/14/16/20/24px, line-height is 1.6 for prose and 1.3 for compact labels, row height is 36px, pane padding is 16px/24px, and bar radius is 2px.

## Interaction Model

- Scale toggle: Day, Week, Month. Default is Week when the schedule range is larger than one month.
- Expand/collapse controls operate on derived WBS summary rows.
- Clicking a bar or row selects the activity and opens the detail Sheet.
- Inline cells support name, start, finish, duration, and predecessor display. Editable fields use existing validation; predecessor creation remains through the dependency contract.
- Manual bar drag changes start and finish while preserving duration. Right-edge drag changes duration and finish.
- Dependency lines route as thin SVG elbow polylines with arrowheads. Hovering a bar highlights only connected lines.
- Keyboard focus is visible in accent color. Grid navigation follows Tab between cells and Arrow keys between rows.
- Calendar view is read-only and derived from the same schedule rows. More than three tasks per day expands with `+N مورد دیگر`.

## States

- Loading: skeleton rows mirror grid column widths and 36px row height.
- Empty project: Persian explanation plus CTA to the existing activity/WBS flow.
- Error: non-sensitive Persian message and retry action; mutation errors use an inline toast.
- Permission denied: read-only workspace; mutation controls are hidden or disabled based on the established permission state.
- Missing weight: visible `—` with an accessible explanation, never a fake percentage.

## Accessibility and RTL

- The document and workspace remain `dir="rtl"` and `lang="fa"`.
- WBS codes, numeric values, and ISO-like technical values use explicit `dir="ltr"` where required.
- The task surface uses `role="grid"`, row and cell semantics, labeled headers, and live status for save errors.
- Every bar has an accessible label containing task name, Jalali start/end, and duration.
- All interactive controls have visible focus, keyboard operation, and sufficient contrast in both themes.
- Timeline order is not reversed by RTL CSS; only labels and task-grid reading order are RTL.

## Testing Strategy

- Unit tests for row flattening, WBS expansion, date-to-pixel mapping, scale headers, Jalali formatting boundaries, and dependency routing.
- UI tests for inline edit success/failure, permission-aware controls, keyboard grid navigation, synchronized scrolling, empty/loading/error states, and read-only calendar behavior.
- Existing API/security tests remain the authority for tenant isolation, permission enforcement, validation, cycle detection, and audit behavior.
- Run focused frontend typecheck/build and the related scheduling/API test suites before broader repository validation.

## Rollback and Follow-up

The first implementation is additive at the component boundary and keeps existing API contracts. If visual or interaction regressions occur, the previous `SchedulingPage` and `GanttChart` implementation can be restored without a database migration. A later prompt may revise component visuals without changing the data and security contracts in this specification.
