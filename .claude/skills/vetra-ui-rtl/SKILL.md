---
name: vetra-ui-rtl
description: Persian-first RTL interface authority for VETRA OS. Use when designing, auditing, or changing frontend layouts, forms, tables, dialogs, navigation, dashboards, charts, Gantt, calendars, notifications, validation, accessibility, responsive behavior, Shamsi dates, timezone display, or any Persian/RTL user experience.
---

# VETRA UI RTL

Maintain a professional Persian-first, RTL user interface for VETRA OS. Treat the frontend as a dense enterprise workspace for construction and ERP operations: prioritize information clarity, consistency, keyboard access, safe data entry, and predictable dates over decorative complexity.

## Mandatory interface baseline

Ensure the actual application provides, according to its framework and routing setup:

- `lang="fa"` or the framework-equivalent locale declaration.
- RTL direction at the correct document or application boundary.
- Persian-first labels, validation, empty, loading, error, and confirmation states.
- Persian/Shamsi date presentation with technically correct internal date and timezone semantics.
- Accessible semantic structure, keyboard navigation, visible focus, labels, sufficient contrast, and screen-reader compatibility.
- Responsive behavior with a desktop-first enterprise layout and workable mobile compatibility.
- Local or self-hosted fonts, icons, and assets; do not load UI icons or fonts from external CDNs.

Inspect the actual framework, design system, routing, asset pipeline, and date libraries before changing them. Do not introduce a replacement UI stack or arbitrary CSS workaround without repository evidence and approval.

## Frontend audit workflow

Before a UI change:

1. Read applicable `AGENTS.md` files, product documentation, localization rules, and existing design-system conventions.
2. Inspect the document root, locale and direction handling, routing, layouts, theme tokens, fonts, icon sources, component primitives, date utilities, and build assets.
3. Trace the affected data from API/domain source to formatting, input state, validation, loading, error, empty, and success states.
4. Audit the relevant forms, tables, dialogs, dropdowns, navigation, charts, Gantt, calendars, dashboards, notifications, and permission-aware controls.
5. Confirm which values are Persian/Shamsi presentation and which must remain LTR data, such as numbers, IDs, codes, URLs, formulas, dates in technical payloads, and source text.
6. Implement with existing components and tokens where possible, then test keyboard, screen-reader semantics, responsive layout, and date behavior.
7. Run the repository's focused tests, typecheck, build, and a visual or smoke check when available.

## Dates, numbers, and directionality

Keep internal dates in the technically correct representation used by the repository, with explicit timezone handling. Convert to Persian/Shamsi only at the presentation boundary or through a tested date utility. Do not mix Gregorian and Shamsi dates accidentally in one workflow, compare formatted strings as dates, or use a browser locale as an implicit business rule.

Use RTL for Persian prose and navigation, but preserve LTR treatment where the data itself is directional or technical. Do not solve RTL with broad arbitrary CSS that reverses numeric columns, identifiers, codes, charts, Gantt timelines, formulas, or mixed-language content. Test alignment, ordering, sorting, cursor movement, copy/paste, validation, and screen-reader reading order.

## Enterprise component checklist

| Surface | Verify |
| --- | --- |
| Forms | Persian labels, field descriptions, validation, required state, keyboard order, error focus, units, numeric direction, and safe submission state. |
| Tables | Column meaning, dense but readable spacing, numeric alignment, sort/filter semantics, responsive overflow, export context, and permissions. |
| Dialogs and dropdowns | Focus trap, escape behavior, portal direction, selection semantics, validation, and destructive-action confirmation. |
| Navigation | Current location, keyboard access, collapsed/mobile behavior, permission-aware items, and readable breadcrumbs. |
| Charts and Gantt | Correct date scale, legends, RTL labels without reversing time semantics, tooltip accessibility, and empty/error states. |
| Calendars and notifications | Shamsi display, timezone consistency, unread/status semantics, and actionable keyboard behavior. |
| Loading, empty, and error states | Clear Persian explanation, recovery action, no misleading success, and no sensitive error leakage. |

## Accessibility and asset rules

Use semantic HTML and accessible names before adding ARIA. Make focus order, focus visibility, keyboard navigation, dialog behavior, table headers, form associations, and status announcements testable. Maintain adequate contrast and do not communicate important state by color alone.

Keep fonts, icons, and UI assets local or self-hosted through the repository's asset pipeline. Verify license and bundle behavior before adding an asset. Do not use external CDNs for convenience in a sensitive enterprise application.

## UI validation report

```markdown
# RTL UI Change: <short title>

## Surfaces audited
<Routes, components, forms, tables, charts, calendars, and states.>

## Locale and date behavior
<Language, direction, Shamsi conversion, internal representation, and timezone.>

## Accessibility
<Keyboard, semantics, focus, labels, contrast, and screen-reader considerations.>

## Validation
<Exact test, typecheck, build, and visual/smoke commands with actual results.>

## Remaining issues
<Unsupported browser, responsive, asset, or data-format limitations.>
```

Do not hide data, reverse technical values, or loosen validation simply to make a Persian RTL screen look correct. Preserve the underlying business semantics and make presentation conversions explicit and tested.
