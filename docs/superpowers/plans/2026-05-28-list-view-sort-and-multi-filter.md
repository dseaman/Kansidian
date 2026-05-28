# List view: sortable columns and multi-select filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add click-to-cycle column sorting and checkbox-popover multi-select filters to the Kandyban list (table) view.

**Architecture:** Sort comparators live in a new pure module `src/views/list-sort.ts` (testable without DOM). The list view consumes them in its render path. Filter state changes from single-value strings to `Set<string>` and is driven by a popover-button UI instead of native dropdowns. No persistence, no settings schema changes.

**Tech Stack:** TypeScript (strict, ESM), Obsidian Plugin API, Vitest. Styles in `styles.css` using Obsidian theme CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-28-list-view-sort-and-multi-filter-design.md`

---

## File Structure

| File | Role | Status |
| --- | --- | --- |
| `src/views/list-sort.ts` | Pure sort comparators (`compareItems`, types) | Create |
| `src/views/list-view.ts` | Filter state shape, sort state, sortable headers, popover, render flow | Modify |
| `styles.css` | Filter button, popover, sort indicators | Modify |
| `tests/list-sort.test.ts` | Vitest tests for `compareItems` | Create |

---

## Task 1: Pure sort module with tests (TDD)

**Files:**
- Create: `src/views/list-sort.ts`
- Create: `tests/list-sort.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/list-sort.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
	compareItems,
	type SortState,
	type SortVocabulary,
} from "../src/views/list-sort";
import type { ParsedItem } from "../src/parser";

const vocab: SortVocabulary = {
	status: ["open", "in-progress", "done"],
	horizon: ["now", "next", "later"],
};

function item(overrides: {
	id: string;
	title?: string;
	status?: string;
	horizon?: string;
	milestone?: string;
	scope?: string;
}): ParsedItem {
	return {
		id: overrides.id,
		kind: overrides.id.startsWith("MS-") ? "milestone" : "backlog",
		title: overrides.title ?? overrides.id,
		raw: overrides.scope !== undefined ? { scope: overrides.scope } : {},
		enums: {
			status: overrides.status,
			horizon: overrides.horizon,
			milestone: overrides.milestone,
			dependsOn: [],
		},
	};
}

function sortedIds(items: ParsedItem[], sort: SortState): string[] {
	return [...items]
		.sort((a, b) => compareItems(a, b, sort, vocab))
		.map((x) => x.id);
}

describe("compareItems — id column", () => {
	it("orders BL-2 before BL-10 (natural sort)", () => {
		const items = [item({ id: "BL-10" }), item({ id: "BL-2" }), item({ id: "BL-100" })];
		expect(sortedIds(items, { column: "id", direction: "asc" })).toEqual([
			"BL-2",
			"BL-10",
			"BL-100",
		]);
	});

	it("orders BL prefix before MS prefix", () => {
		const items = [item({ id: "MS-1" }), item({ id: "BL-99" })];
		expect(sortedIds(items, { column: "id", direction: "asc" })).toEqual([
			"BL-99",
			"MS-1",
		]);
	});

	it("reverses for desc direction", () => {
		const items = [item({ id: "BL-1" }), item({ id: "BL-2" })];
		expect(sortedIds(items, { column: "id", direction: "desc" })).toEqual([
			"BL-2",
			"BL-1",
		]);
	});
});

describe("compareItems — title column", () => {
	it("is case-insensitive and numeric-aware", () => {
		const items = [
			item({ id: "A", title: "Step 10" }),
			item({ id: "B", title: "step 2" }),
			item({ id: "C", title: "Alpha" }),
		];
		expect(sortedIds(items, { column: "title", direction: "asc" })).toEqual([
			"C",
			"B",
			"A",
		]);
	});
});

describe("compareItems — status column", () => {
	it("sorts by vocabulary order, not alphabetical", () => {
		const items = [
			item({ id: "A", status: "done" }),
			item({ id: "B", status: "open" }),
			item({ id: "C", status: "in-progress" }),
		];
		expect(sortedIds(items, { column: "status", direction: "asc" })).toEqual([
			"B",
			"C",
			"A",
		]);
	});

	it("places out-of-vocab values after in-vocab, alphabetically", () => {
		const items = [
			item({ id: "A", status: "zeta" }),
			item({ id: "B", status: "done" }),
			item({ id: "C", status: "alpha" }),
			item({ id: "D", status: "open" }),
		];
		expect(sortedIds(items, { column: "status", direction: "asc" })).toEqual([
			"D",
			"B",
			"C",
			"A",
		]);
	});

	it("places undefined status at the end regardless of direction", () => {
		const items = [
			item({ id: "A" }),
			item({ id: "B", status: "open" }),
			item({ id: "C", status: "done" }),
		];
		expect(sortedIds(items, { column: "status", direction: "asc" })).toEqual([
			"B",
			"C",
			"A",
		]);
		expect(sortedIds(items, { column: "status", direction: "desc" })).toEqual([
			"C",
			"B",
			"A",
		]);
	});
});

describe("compareItems — horizon column", () => {
	it("sorts by horizon vocabulary order", () => {
		const items = [
			item({ id: "A", horizon: "later" }),
			item({ id: "B", horizon: "now" }),
			item({ id: "C", horizon: "next" }),
		];
		expect(sortedIds(items, { column: "horizon", direction: "asc" })).toEqual([
			"B",
			"C",
			"A",
		]);
	});
});

describe("compareItems — milestone column", () => {
	it("natural-sorts milestone ids and puts undefined last", () => {
		const items = [
			item({ id: "A", milestone: "MS-10" }),
			item({ id: "B" }),
			item({ id: "C", milestone: "MS-2" }),
		];
		expect(sortedIds(items, { column: "milestone", direction: "asc" })).toEqual([
			"C",
			"A",
			"B",
		]);
		expect(sortedIds(items, { column: "milestone", direction: "desc" })).toEqual([
			"A",
			"C",
			"B",
		]);
	});
});

describe("compareItems — scope column", () => {
	it("string-compares scope and puts undefined last", () => {
		const items = [
			item({ id: "A", scope: "frontend" }),
			item({ id: "B" }),
			item({ id: "C", scope: "backend" }),
		];
		expect(sortedIds(items, { column: "scope", direction: "asc" })).toEqual([
			"C",
			"A",
			"B",
		]);
	});
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- list-sort`
Expected: All tests fail with a module-resolution error (cannot find `../src/views/list-sort`).

- [ ] **Step 3: Implement the comparator module**

Create `src/views/list-sort.ts`:

```ts
import type { ParsedItem } from "../parser";

export type SortColumn = "id" | "title" | "status" | "horizon" | "milestone" | "scope";
export type SortDirection = "asc" | "desc";

export interface SortState {
	column: SortColumn;
	direction: SortDirection;
}

export interface SortVocabulary {
	status: string[];
	horizon: string[];
}

// Top-level comparator. Missing values always sort to the end
// (direction-independent); the rest of the result inverts on `desc`.
export function compareItems(
	a: ParsedItem,
	b: ParsedItem,
	sort: SortState,
	vocab: SortVocabulary,
): number {
	const valA = pluck(a, sort.column);
	const valB = pluck(b, sort.column);

	if (valA === undefined && valB === undefined) return 0;
	if (valA === undefined) return 1;
	if (valB === undefined) return -1;

	const result = compareValues(valA, valB, sort.column, vocab);
	return sort.direction === "desc" ? -result : result;
}

function pluck(item: ParsedItem, column: SortColumn): string | undefined {
	switch (column) {
		case "id":
			return item.id;
		case "title":
			return item.title;
		case "status":
			return item.enums.status;
		case "horizon":
			return item.enums.horizon;
		case "milestone":
			return item.enums.milestone;
		case "scope":
			return item.raw["scope"];
	}
}

function compareValues(
	a: string,
	b: string,
	column: SortColumn,
	vocab: SortVocabulary,
): number {
	switch (column) {
		case "id":
		case "milestone":
			return naturalCompare(a, b);
		case "title":
		case "scope":
			return localeCompare(a, b);
		case "status":
			return vocabCompare(a, b, vocab.status);
		case "horizon":
			return vocabCompare(a, b, vocab.horizon);
	}
}

function localeCompare(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

// Splits "PREFIX-DIGITS" so BL-2 sorts before BL-10. Falls back to locale
// compare when either string doesn't match the pattern.
function naturalCompare(a: string, b: string): number {
	const ma = a.match(/^([A-Za-z]+)-?(\d+)/);
	const mb = b.match(/^([A-Za-z]+)-?(\d+)/);
	if (ma && mb) {
		const px = ma[1]!.localeCompare(mb[1]!);
		if (px !== 0) return px;
		return Number(ma[2]) - Number(mb[2]);
	}
	return localeCompare(a, b);
}

// In-vocab values come first in configured order; out-of-vocab values come
// after, in locale order. On `desc` the whole thing inverts uniformly.
function vocabCompare(a: string, b: string, vocab: string[]): number {
	const ai = vocab.indexOf(a);
	const bi = vocab.indexOf(b);
	if (ai !== -1 && bi !== -1) return ai - bi;
	if (ai !== -1) return -1;
	if (bi !== -1) return 1;
	return localeCompare(a, b);
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- list-sort`
Expected: All tests pass.

- [ ] **Step 5: Run lint and typecheck**

Run: `npm run lint`
Expected: No errors.

Run: `npm run build`
Expected: TypeScript typecheck passes; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/views/list-sort.ts tests/list-sort.test.ts
git commit -m "$(cat <<'EOF'
list view: add pure sort comparator module

Adds src/views/list-sort.ts with compareItems and unit tests. Pure logic,
no DOM dependencies. Status/horizon sort by configured vocabulary order;
id/milestone use natural sort; title/scope use locale compare; missing
values always sort to the end.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire sort into the list view

**Files:**
- Modify: `src/views/list-view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Import sort types and add sort state**

In `src/views/list-view.ts`, add this import near the top:

```ts
import { compareItems, type SortColumn, type SortDirection, type SortState } from "./list-sort";
```

Add a `sort` field to the class, next to `filters`:

```ts
private sort: SortState | null = null;
```

- [ ] **Step 2: Apply sort in render**

In `render()`, replace the existing `const filtered = this.applyFilters(entries);` line with:

```ts
const filtered = this.applyFilters(entries);
const sorted = this.applySort(filtered);
```

Then in the row-rendering loop, iterate `sorted` instead of `filtered`:

```ts
for (const [file, item] of sorted) {
	this.renderRow(tbody, file, item);
}
```

The empty-state check (`if (filtered.length === 0)`) stays based on `filtered` — an empty result is the same whether or not sort is applied.

- [ ] **Step 3: Add the applySort helper**

Add this method to the class:

```ts
private applySort(entries: Entry[]): Entry[] {
	if (!this.sort) return entries;
	const vocab = {
		status: this.plugin.settings.statusEnums,
		horizon: this.plugin.settings.horizonEnums,
	};
	const sort = this.sort;
	return [...entries].sort(([, a], [, b]) => compareItems(a, b, sort, vocab));
}
```

- [ ] **Step 4: Make the header row sortable**

Replace the header-row loop in `render()`:

```ts
for (const label of ["id", "title", "status", "horizon", "milestone", "scope"]) {
	headerRow.createEl("th", { text: label });
}
```

with:

```ts
const SORTABLE_COLUMNS: SortColumn[] = ["id", "title", "status", "horizon", "milestone", "scope"];
for (const column of SORTABLE_COLUMNS) {
	this.renderHeaderCell(headerRow, column);
}
```

Move the `SORTABLE_COLUMNS` constant to module scope (above the class) so it isn't recreated each render.

Add this method to the class:

```ts
private renderHeaderCell(headerRow: HTMLElement, column: SortColumn): void {
	const th = headerRow.createEl("th", { cls: "kansidian-list-th" });
	th.createSpan({ text: column, cls: "kansidian-list-th-label" });

	const indicator = th.createSpan({ cls: "kansidian-list-th-indicator" });
	if (this.sort?.column === column) {
		setIcon(indicator, this.sort.direction === "asc" ? "arrow-up" : "arrow-down");
		th.addClass("kansidian-list-th-active");
	}

	th.addEventListener("click", () => this.cycleSort(column));
}

private cycleSort(column: SortColumn): void {
	const next = nextSortState(this.sort, column);
	this.sort = next;
	this.render();
}
```

Add this pure helper at module scope (above the class):

```ts
function nextSortState(current: SortState | null, column: SortColumn): SortState | null {
	if (current?.column !== column) return { column, direction: "asc" };
	if (current.direction === "asc") return { column, direction: "desc" };
	return null;
}
```

The unused `SortDirection` import can be dropped if TypeScript flags it — only `SortColumn` and `SortState` are actually used in the file. Drop it now to keep the import clean.

- [ ] **Step 5: Add styles for sortable headers**

In `styles.css`, find this existing block:

```css
.kansidian-list-table thead th {
	font-weight: 600;
	text-transform: uppercase;
	font-size: 11px;
	color: var(--text-muted);
}
```

Add this immediately after it:

```css
.kansidian-list-th {
	cursor: pointer;
	user-select: none;
}

.kansidian-list-th:hover {
	color: var(--text-normal);
}

.kansidian-list-th-active {
	color: var(--text-normal);
}

.kansidian-list-th-indicator {
	display: inline-flex;
	align-items: center;
	margin-left: 4px;
	vertical-align: middle;
}

.kansidian-list-th-indicator .svg-icon {
	width: 12px;
	height: 12px;
}
```

- [ ] **Step 6: Verify the build and run tests**

Run: `npm run build`
Expected: Typecheck and build pass.

Run: `npm test`
Expected: All tests still pass (existing sort tests are unaffected).

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 7: Manual smoke test (Obsidian)**

If Obsidian is set up to load this plugin:

1. Open the Kandyban list view.
2. Click the `id` header → table sorts ascending, up-arrow appears.
3. Click `id` again → sort flips to descending, arrow flips.
4. Click `id` a third time → arrow disappears, table returns to original order.
5. Click `status` → table sorts by configured vocabulary order (e.g. `open` rows first, not alphabetical).
6. Click a row's id/title to confirm file-open still works (no event-bubbling regression).

If Obsidian isn't available right now, note that — the typecheck and test pass are the gating signals.

- [ ] **Step 8: Commit**

```bash
git add src/views/list-view.ts styles.css
git commit -m "$(cat <<'EOF'
list view: sortable columns with click-to-cycle direction

Each column header is now clickable: 1st click sorts ascending, 2nd
descending, 3rd clears the sort and restores index order. Status and
horizon use the configured vocabulary order; id/milestone use natural
sort; title/scope use locale compare. Direction indicator shown via
arrow icon in the active header.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Multi-select filter popover

**Files:**
- Modify: `src/views/list-view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Change `ListFilters` to use `Set<string> | null` (three-state)**

In `src/views/list-view.ts`, replace the existing `ListFilters` interface:

```ts
interface ListFilters {
	search: string;
	status: string;
	horizon: string;
	milestone: string;
}
```

with:

```ts
type FilterKey = "status" | "horizon" | "milestone";

interface ListFilters {
	search: string;
	status: Set<string> | null;
	horizon: Set<string> | null;
	milestone: Set<string> | null;
}
```

State semantics: `null` = no filter (match all, the default). Non-empty `Set` = match only those values. Empty `Set` = explicitly empty (match nothing).

And update the initializer on the class:

```ts
private filters: ListFilters = {
	search: "",
	status: null,
	horizon: null,
	milestone: null,
};
```

- [ ] **Step 2: Update `applyFilters` for the three-state model**

Replace the existing `applyFilters` method:

```ts
private applyFilters(entries: Entry[]): Entry[] {
	const { search, status, horizon, milestone } = this.filters;
	const needle = search.trim().toLowerCase();
	return entries.filter(([, item]) => {
		if (status !== null) {
			if (!item.enums.status || !status.has(item.enums.status)) return false;
		}
		if (horizon !== null) {
			if (!item.enums.horizon || !horizon.has(item.enums.horizon)) return false;
		}
		if (milestone !== null) {
			if (!item.enums.milestone || !milestone.has(item.enums.milestone)) return false;
		}
		if (needle) {
			const haystack = `${item.id} ${item.title}`.toLowerCase();
			if (!haystack.includes(needle)) return false;
		}
		return true;
	});
}
```

A `null` filter matches all items, including those with `undefined` for the field. A `Set` filter (empty or otherwise) excludes items whose value is `undefined` — there's no checkbox for `undefined`.

- [ ] **Step 3: Track the open popover on the class**

Add a field to hold the currently-open popover (if any), so opening a second filter closes the first:

```ts
private openPopover: { wrapper: HTMLElement; cleanup: () => void } | null = null;
```

Add this method:

```ts
private closeOpenPopover(): void {
	if (!this.openPopover) return;
	this.openPopover.cleanup();
	this.openPopover.wrapper.remove();
	this.openPopover = null;
}
```

Call it at the start of `render()` so a re-render tears down any stale popover:

```ts
private render(): void {
	this.closeOpenPopover();
	const root = this.containerEl.children[1];
	// ...rest unchanged...
}
```

- [ ] **Step 4: Replace the filter dropdowns with popover buttons**

Replace the existing `renderFilterSelect` calls and method.

In `renderToolbar`, replace this block:

```ts
this.renderFilterSelect(toolbar, "status", uniqueStatuses, this.filters.status, (v) => {
	this.filters.status = v;
});
this.renderFilterSelect(toolbar, "horizon", uniqueHorizons, this.filters.horizon, (v) => {
	this.filters.horizon = v;
});
this.renderFilterSelect(toolbar, "milestone", uniqueMilestones, this.filters.milestone, (v) => {
	this.filters.milestone = v;
});
```

with:

```ts
this.renderMultiSelectFilter(toolbar, "status", uniqueStatuses);
this.renderMultiSelectFilter(toolbar, "horizon", uniqueHorizons);
this.renderMultiSelectFilter(toolbar, "milestone", uniqueMilestones);
```

Delete the existing `renderFilterSelect` method.

Add the new methods:

```ts
private renderMultiSelectFilter(
	toolbar: HTMLElement,
	key: FilterKey,
	options: string[],
): void {
	const selection = this.filters[key];
	const wrapper = toolbar.createDiv({ cls: `kansidian-list-filter kansidian-list-filter-${key}` });
	const button = wrapper.createEl("button", {
		cls: "kansidian-list-filter-button",
		text: filterButtonLabel(key, options, selection),
	});
	if (selection !== null) button.addClass("kansidian-list-filter-button-active");
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		this.toggleFilterPopover(wrapper, key, options);
	});
}

private toggleFilterPopover(
	anchor: HTMLElement,
	key: FilterKey,
	options: string[],
): void {
	// If the currently-open popover belongs to this anchor, just close it.
	if (this.openPopover?.wrapper === anchor) {
		this.closeOpenPopover();
		return;
	}
	this.closeOpenPopover();

	const popover = anchor.createDiv({ cls: "kansidian-list-filter-popover" });
	const selection = this.filters[key];
	const allActive = selection === null;
	const someSelected = selection !== null && selection.size > 0;

	// All toggle (tri-state). null → empty Set; anything else → null.
	const allRow = popover.createDiv({ cls: "kansidian-list-filter-row kansidian-list-filter-all" });
	const allCheckbox = allRow.createEl("input", { type: "checkbox" });
	allCheckbox.checked = allActive;
	allCheckbox.indeterminate = someSelected;
	allRow.createSpan({ text: `all ${key}` });
	allRow.addEventListener("click", (event) => {
		event.stopPropagation();
		this.filters[key] = allActive ? new Set<string>() : null;
		this.render();
	});

	// One row per observed value. When selection is null, all are shown checked.
	for (const opt of options) {
		const row = popover.createDiv({ cls: "kansidian-list-filter-row" });
		const checkbox = row.createEl("input", { type: "checkbox" });
		checkbox.checked = selection === null || selection.has(opt);
		row.createSpan({ text: opt });
		row.addEventListener("click", (event) => {
			event.stopPropagation();
			this.toggleFilterValue(key, options, opt);
		});
	}

	const onDocumentClick = (event: MouseEvent): void => {
		if (!(event.target instanceof Node)) return;
		if (popover.contains(event.target) || anchor.contains(event.target)) return;
		this.closeOpenPopover();
	};
	const onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === "Escape") this.closeOpenPopover();
	};
	document.addEventListener("mousedown", onDocumentClick);
	document.addEventListener("keydown", onKeyDown);

	this.openPopover = {
		wrapper: anchor,
		cleanup: () => {
			document.removeEventListener("mousedown", onDocumentClick);
			document.removeEventListener("keydown", onKeyDown);
		},
	};
}

private toggleFilterValue(key: FilterKey, options: string[], opt: string): void {
	const current = this.filters[key];
	if (current === null) {
		// "all" → user is unchecking one item; seed with every option minus this one
		const next = new Set(options);
		next.delete(opt);
		this.filters[key] = next;
	} else if (current.has(opt)) {
		current.delete(opt);
	} else {
		current.add(opt);
		// Normalise: if every option is now selected, collapse to "all" (null).
		if (current.size === options.length) {
			this.filters[key] = null;
		}
	}
	this.render();
}
```

Add the label helper at module scope (above the class):

```ts
function filterButtonLabel(
	key: string,
	options: string[],
	selection: Set<string> | null,
): string {
	if (options.length === 0) return `${key}: —`;
	if (selection === null) return `${key}: all (${options.length})`;
	if (selection.size === 0) return `${key}: none`;
	return `${key}: ${selection.size} of ${options.length}`;
}
```

- [ ] **Step 5: Adjust filter-popover CSS**

In `styles.css`, find:

```css
.kansidian-list-filter {
	padding: 4px 6px;
}
```

Replace it with:

```css
.kansidian-list-filter {
	position: relative;
}

.kansidian-list-filter-button {
	padding: 4px 8px;
	background: var(--background-secondary);
	color: var(--text-normal);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	cursor: pointer;
	font-size: var(--font-ui-small, 13px);
}

.kansidian-list-filter-button:hover {
	background: var(--background-modifier-hover);
}

.kansidian-list-filter-button-active {
	border-color: var(--interactive-accent);
	color: var(--text-normal);
}

.kansidian-list-filter-popover {
	position: absolute;
	top: calc(100% + 4px);
	left: 0;
	z-index: 20;
	min-width: 160px;
	max-height: 300px;
	overflow-y: auto;
	padding: 4px 0;
	background: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.kansidian-list-filter-row {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	cursor: pointer;
	user-select: none;
	font-size: var(--font-ui-small, 13px);
	color: var(--text-normal);
}

.kansidian-list-filter-row:hover {
	background: var(--background-modifier-hover);
}

.kansidian-list-filter-all {
	border-bottom: 1px solid var(--background-modifier-border);
	font-weight: 600;
}

.kansidian-list-filter-row input[type="checkbox"] {
	pointer-events: none; /* row click is the canonical handler */
}
```

The `pointer-events: none` on the inner checkbox prevents a double-toggle: the row's click handler is the sole source of truth and the checkbox is just a visual indicator.

- [ ] **Step 6: Sanity-check the filter call sites**

Run: `grep -n "this.filters\." src/views/list-view.ts`
Expected references, all consistent with the new type:
- `applyFilters` reads `status`, `horizon`, `milestone`, `search`
- `renderMultiSelectFilter` reads `this.filters[key]`
- `toggleFilterPopover` reads `this.filters[key]` and assigns it
- `toggleFilterValue` reads and assigns `this.filters[key]`
- `searchInput.addEventListener` callbacks still read/write `this.filters.search`

No leftover string assignments to `this.filters.status`, `.horizon`, or `.milestone`. If any exist, update them.

- [ ] **Step 7: Verify the build and run tests**

Run: `npm run build`
Expected: Typecheck and build pass.

Run: `npm test`
Expected: All tests pass.

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 8: Manual smoke test (Obsidian)**

If Obsidian is available:

1. Open the list view. Each filter button should read `status: all (N)` etc.
2. Click `status` → popover opens with checkboxes per observed status, plus "all status" row.
3. Toggle off `done` → table updates immediately; button reads `status: K of N`; popover stays open.
4. Click outside the popover → it closes.
5. Open `horizon`, then click on `status` button → first popover closes, second opens.
6. Press `Escape` → popover closes.
7. Confirm sort still works alongside filters: filter by status, then click `id` to sort — filtered + sorted view renders correctly.

If Obsidian isn't available, the typecheck, lint, and test pass are the gating signals.

- [ ] **Step 9: Commit**

```bash
git add src/views/list-view.ts styles.css
git commit -m "$(cat <<'EOF'
list view: multi-select filter popovers for status/horizon/milestone

Replaces the single-value dropdowns with button-anchored popovers
containing one checkbox per observed value, plus an all/none toggle.
Filter state is now Set<string> per dimension; empty set means "no
filter" (match everything). Popovers close on outside click or Escape,
and opening a second popover closes the first.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Multi-select filters on status/horizon/milestone — Task 3 ✓
- Click-to-cycle column sorting (asc → desc → none) — Task 2 ✓
- Single active sort column — Task 2 (`nextSortState` returns one column at a time) ✓
- Sort by configured vocabulary order for status/horizon — Task 1 (`vocabCompare`) ✓
- Natural sort for id/milestone — Task 1 (`naturalCompare`) ✓
- Locale compare for title/scope — Task 1 (`localeCompare`) ✓
- Missing values to end regardless of direction — Task 1 (top-of-`compareItems` undefined check) ✓
- Three-state filter model (`null`/`Set`/empty `Set`) — Task 3 Step 1, semantics enforced in `applyFilters` and `toggleFilterValue` ✓
- Popover closes on outside click / Escape / opening another popover — Task 3 (`closeOpenPopover`, document listeners) ✓
- No persistence — confirmed; nothing in any task touches plugin data ✓
- No board view changes — confirmed ✓

**Placeholder scan:** No `TBD`, `TODO`, "implement later", or "appropriate error handling" instructions. Every code step shows full code. Every command shows expected output.

**Type consistency:** `SortState`, `SortColumn`, `SortDirection`, `SortVocabulary` are introduced in Task 1 and consistently referenced in Task 2. `Set<string>` filter shape is introduced in Task 3 Step 1 and consistently used through Steps 2–7. `compareItems` signature matches across the comparator (Task 1) and its single call site (Task 2). `filterButtonLabel` and `nextSortState` are pure functions placed at module scope where their callers expect them.

**Caveat:** Task 3 now uses the three-state model (`Set<string> | null`). This is a refinement over the spec's original empty-set-means-all convention; the spec has been updated to match. The user-visible behaviour is unchanged.
