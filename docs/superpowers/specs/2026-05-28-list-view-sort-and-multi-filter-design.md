# List view: sortable columns and multi-select filters

**Status:** Draft
**Date:** 2026-05-28
**Scope:** `src/views/list-view.ts` (the table view) and supporting test/sort utilities. Board view is unchanged.

## Problem

The list view shows a table of backlog and milestone items. Today the toolbar offers a search box and three single-select dropdowns (`status`, `horizon`, `milestone`) — each lets the user pick either "all" or exactly one value. Column headers are static.

Two real workflows fall out of reach:

1. **Exclusion-style filtering.** "Show me everything except `done`" requires selecting three other statuses individually — but the current dropdown only lets you pick one. There is no way to combine multiple values.
2. **Ad-hoc ordering.** The index order is fine as a default, but the user can't sort by any column to scan a particular dimension (e.g. by milestone to see what's bundled where, or by title to spot duplicates).

## Goals

- Multi-select filtering on `status`, `horizon`, and `milestone` — any subset of observed values.
- Per-column click-to-sort with three states (ascending, descending, none) and a single active sort column.
- Keep the existing search box, enum-edit click behavior, and overall layout intact.
- No changes to plugin data, settings schema, or persisted state.

## Non-goals

- Multi-column sort.
- Sorting or new filter UX in the board view.
- Persisting sort/filter state across Obsidian restarts.
- Filtering by a text needle against fields other than `id`/`title` (current search scope is unchanged).
- A "global reset" or saved-view abstraction.

## Design

### Filter UI — popover with checkboxes

Each of the three filter controls in the toolbar becomes a button. The button label summarises selection state:

- `status: all (4)` — no filter applied (default).
- `status: 3 of 4` — partial selection.
- `status: none` — explicitly empty after the user unchecked everything (rare; matches nothing, table will be empty).

Clicking the button opens an absolutely-positioned popover anchored beneath it. The popover contains:

- An "all" toggle row at the top with a tri-state checkbox: checked when no filter is applied, indeterminate when partially selected, unchecked when explicitly empty.
- One checkbox row per **observed** value (i.e. values that actually appear in the current entries — same source as today's dropdown). Values are sorted alphabetically.
- Closes on: outside click, `Escape` key, or losing focus to another popover.

Internal state model — the existing `ListFilters` type changes:

```ts
interface ListFilters {
    search: string;
    status: Set<string> | null;
    horizon: Set<string> | null;
    milestone: Set<string> | null;
}
```

Filter semantics — three distinct states per filter:

- `null` — no filter applied. Match everything. This is the default and the initial state.
- A non-empty `Set` — match only items whose value is in the set.
- An empty `Set` — explicitly empty. Match nothing (filter applied, no values pass).

This three-state model avoids the ambiguity of conflating "no filter" with "every option selected." Normalisation: whenever a per-value toggle leaves all observed values in the set, the state collapses to `null`. The user can never construct a "complete-set" state through the UI — only `null` (all) or a strict subset.

Items whose value is `undefined` for a given field always match when the filter is `null`, and never match when the filter is a `Set` (empty or non-empty) — consistent with today's behaviour, since there's no checkbox for `undefined`.

All-toggle behaviour:

- Click when `null` (checkbox shown checked) → set to empty `Set` (match nothing).
- Click when partial (checkbox shown indeterminate) → set to `null` (no filter).
- Click when empty `Set` (checkbox shown unchecked) → set to `null` (no filter).

### Column sorting — click-to-cycle headers

All six columns (`id`, `title`, `status`, `horizon`, `milestone`, `scope`) become clickable. Behaviour:

- 1st click on a column: sort ascending by that column. An up-arrow icon appears in the header (via `setIcon(el, "arrow-up")`).
- 2nd click on the same column: sort descending. Arrow flips to `arrow-down`.
- 3rd click on the same column: clear the sort. Arrow disappears. The table reverts to the natural index order.
- Clicking a different column: switches to that column with ascending direction.

Only one column is sorted at a time.

Sort state lives on the view:

```ts
type SortDirection = "asc" | "desc";
type SortColumn = "id" | "title" | "status" | "horizon" | "milestone" | "scope";
interface SortState {
    column: SortColumn;
    direction: SortDirection;
}
private sort: SortState | null = null;
```

### Comparators

Pure comparator functions live in a new module so they can be tested without the Obsidian DOM:

```
src/views/list-sort.ts
  export function compareEntries(
      a: Entry,
      b: Entry,
      sort: SortState,
      vocab: { status: string[]; horizon: string[] },
  ): number
```

Per-column rules:

- **`id`** — natural sort. Split into prefix (letters) and number (digits) and compare prefix lexicographically, then numerically. `BL-2` precedes `BL-10`; `BL-*` precedes `MS-*`.
- **`title`** — `localeCompare` with `{ sensitivity: "base", numeric: true }`.
- **`status`, `horizon`** — sort by **vocabulary order** (the user's configured `statusEnums` / `horizonEnums` lists, which already drive board column order). Values not in the vocabulary are placed after all configured values, in alphabetical order. Items with an `undefined` value for the field sort to the end regardless of direction.
- **`milestone`** — natural sort like `id`. `undefined` to end.
- **`scope`** — `localeCompare` as for `title`. `undefined` (no scope tag) to end.

Direction is applied by negating the comparator result when `direction === "desc"`. The "undefined to end" rule is direction-independent — missing values stay last in both asc and desc.

`Array.prototype.sort` is stable, so when the user clears the sort (3rd click), the renderer simply skips the sort step and the entries are presented in their original index order.

### Render flow

The order of operations in `render()` becomes:

1. Get `entries` from the index.
2. Apply filters → `filtered`.
3. If `sort` is set, copy `filtered` and sort it via `compareEntries`.
4. Render header, toolbar (with the new popover buttons), header row (with sort indicators), body.

The header count line `(N of M)` stays as is — `N` is post-filter, `M` is total.

### Popover implementation notes

- A single helper `openMultiSelectPopover(...)` handles all three filters. It owns the outside-click and `Escape` listeners and tears them down on close.
- Only one popover is open at a time — opening a second closes the first.
- The popover is rendered as a child of `containerEl` (not `document.body`) so it inherits Obsidian theme variables and disappears when the view closes.
- After a checkbox toggles, the popover stays open (the user is likely editing several at once). Re-render of the table happens immediately on each toggle.

### Focus preservation

The existing `captureFocus` / `restoreFocus` already covers the search input. Filter buttons and the popover are new focusable elements. The simplest correct behaviour: don't try to restore focus into the popover after a re-render — instead, re-render only the table body when a checkbox toggles, leaving the popover DOM untouched. That requires a small refactor of `render()` into `renderShell()` + `renderBody()`. If that proves intrusive in implementation, fall back to a full re-render and explicitly re-open the popover with focus on the value just toggled.

## File-by-file changes

- **`src/views/list-view.ts`** — updated filter state type, new popover button rendering, sortable header rendering, sort state, render-flow update.
- **`src/views/list-sort.ts`** *(new)* — pure comparator module exporting `compareEntries`, plus internal helpers (`naturalIdCompare`, `vocabCompare`).
- **`styles.css`** — styles for the filter button, popover, sort indicators in headers.
- **`tests/list-sort.test.ts`** *(new)* — unit tests for comparators.

## Testing

Unit tests for `compareEntries`:

- `id`: `BL-2` < `BL-10` < `BL-100`; `BL-1` < `MS-1`.
- `title`: case-insensitive, numeric-aware (`"Step 2"` < `"Step 10"`).
- `status`: with vocab `["backlog", "planned", "in-progress", "done"]`, items sort in that order — not alphabetical.
- `status`: a value outside the vocab sorts after all in-vocab values, alphabetically among out-of-vocab.
- `horizon`: same rule as `status`, using the horizon vocab.
- `milestone`: natural sort; `undefined` to end.
- `scope`: `localeCompare`; `undefined` to end.
- Direction `desc` reverses the in-vocab block but keeps `undefined` last.

No DOM tests for the popover in this pass — the multi-select UI is small enough to verify by hand in Obsidian, and the project has no existing DOM-test harness.

## Risks and rollback

- **Risk:** popover positioning breaks on narrow layouts or when the filter button is near a viewport edge. *Mitigation:* anchor with `position: absolute` relative to the toolbar, and let it clip — Obsidian panes scroll. Revisit if it becomes a problem.
- **Risk:** users expect filter selections to persist. *Mitigation:* current filters don't persist either, and this is called out as a non-goal. Easy follow-up if requested.
- **Rollback:** the change is contained to one view file, one new module, one new test file, and a CSS block. Revert is a single commit.

## Open questions

None at design time. Any further UX detail (popover styling, exact arrow icons) is implementation-level and won't change behaviour.
