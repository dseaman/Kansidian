import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type KansidianPlugin from "../main";
import type { ParsedItem } from "../parser";

export const KANSIDIAN_LIST_VIEW_TYPE = "kansidian-list";

interface ListFilters {
	search: string;
	status: string;
	horizon: string;
	milestone: string;
}

type EnumField = "Status" | "Horizon" | "Priority";

export class KansidianListView extends ItemView {
	private readonly plugin: KansidianPlugin;
	private unsubscribe?: () => void;
	private filters: ListFilters = { search: "", status: "", horizon: "", milestone: "" };

	constructor(leaf: WorkspaceLeaf, plugin: KansidianPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return KANSIDIAN_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Kansidian list";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.unsubscribe = this.plugin.index.subscribe(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
	}

	private render(): void {
		const root = this.containerEl.children[1];
		if (!root) return;
		root.empty();
		root.addClass("kansidian-list-root");

		const items = this.plugin.index.all();
		const filtered = this.applyFilters(items);

		const header = root.createDiv({ cls: "kansidian-list-header" });
		header.createEl("h2", { text: `Kansidian list (${filtered.length} of ${items.length})` });

		this.renderToolbar(root.createDiv({ cls: "kansidian-list-toolbar" }), items);

		const table = root.createEl("table", { cls: "kansidian-list-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const label of ["id", "title", "status", "horizon", "milestone", "scope"]) {
			headerRow.createEl("th", { text: label });
		}

		const tbody = table.createEl("tbody");
		if (filtered.length === 0) {
			const emptyRow = tbody.createEl("tr");
			const cell = emptyRow.createEl("td");
			cell.colSpan = 6;
			cell.setText(
				items.length === 0
					? "No items in the index yet. Check the configured paths in settings."
					: "No items match the current filters.",
			);
			return;
		}

		for (const item of filtered) {
			this.renderRow(tbody, item);
		}
	}

	private applyFilters(items: ParsedItem[]): ParsedItem[] {
		const { search, status, horizon, milestone } = this.filters;
		const needle = search.trim().toLowerCase();
		return items.filter((item) => {
			if (status && item.enums.status !== status) return false;
			if (horizon && item.enums.horizon !== horizon) return false;
			if (milestone && item.enums.milestone !== milestone) return false;
			if (needle) {
				const haystack = `${item.id} ${item.title}`.toLowerCase();
				if (!haystack.includes(needle)) return false;
			}
			return true;
		});
	}

	private renderToolbar(toolbar: HTMLElement, items: ParsedItem[]): void {
		const searchInput = toolbar.createEl("input", {
			type: "search",
			placeholder: "Search id or title…",
			cls: "kansidian-list-search",
		});
		searchInput.value = this.filters.search;
		searchInput.addEventListener("input", () => {
			this.filters.search = searchInput.value;
			this.render();
		});

		const uniqueStatuses = sortedUnique(items.map((i) => i.enums.status));
		const uniqueHorizons = sortedUnique(items.map((i) => i.enums.horizon));
		const uniqueMilestones = sortedUnique(items.map((i) => i.enums.milestone));

		this.renderFilterSelect(toolbar, "status", uniqueStatuses, this.filters.status, (v) => {
			this.filters.status = v;
		});
		this.renderFilterSelect(toolbar, "horizon", uniqueHorizons, this.filters.horizon, (v) => {
			this.filters.horizon = v;
		});
		this.renderFilterSelect(toolbar, "milestone", uniqueMilestones, this.filters.milestone, (v) => {
			this.filters.milestone = v;
		});
	}

	private renderFilterSelect(
		parent: HTMLElement,
		label: string,
		options: string[],
		current: string,
		onChange: (value: string) => void,
	): void {
		const select = parent.createEl("select", { cls: `kansidian-list-filter kansidian-list-filter-${label}` });
		select.createEl("option", { text: `all ${label}`, value: "" });
		for (const opt of options) {
			const el = select.createEl("option", { text: opt, value: opt });
			if (opt === current) el.selected = true;
		}
		select.addEventListener("change", () => {
			onChange(select.value);
			this.render();
		});
	}

	private renderRow(tbody: HTMLElement, item: ParsedItem): void {
		const row = tbody.createEl("tr", { cls: "kansidian-list-row" });

		const idCell = row.createEl("td", { text: item.id, cls: "kansidian-list-id" });
		const titleCell = row.createEl("td", { text: item.title, cls: "kansidian-list-title" });
		const statusCell = row.createEl("td", { cls: "kansidian-list-cell-enum" });
		const horizonCell = row.createEl("td", { cls: "kansidian-list-cell-enum" });
		row.createEl("td", { text: item.enums.milestone ?? "", cls: "kansidian-list-milestone" });
		row.createEl("td", { text: item.raw["scope"] ?? "", cls: "kansidian-list-scope" });

		this.renderEnumCell(statusCell, item, "status", this.plugin.settings.statusEnums);
		this.renderEnumCell(horizonCell, item, "horizon", this.plugin.settings.horizonEnums);

		const openFile = (): void => {
			const file = this.findFile(item);
			if (file) void this.app.workspace.getLeaf("tab").openFile(file);
		};
		idCell.addEventListener("click", openFile);
		titleCell.addEventListener("click", openFile);
	}

	private renderEnumCell(
		cell: HTMLElement,
		item: ParsedItem,
		which: "status" | "horizon",
		vocabulary: string[],
	): void {
		const current = item.enums[which] ?? "";
		cell.empty();
		cell.setText(current);

		if (!vocabulary.includes(current) && vocabulary.length === 0) return;

		cell.addEventListener("click", (event) => {
			event.stopPropagation();
			this.openEnumEditor(cell, item, which, vocabulary, current);
		});
	}

	private openEnumEditor(
		cell: HTMLElement,
		item: ParsedItem,
		which: "status" | "horizon",
		vocabulary: string[],
		current: string,
	): void {
		cell.empty();
		const select = cell.createEl("select", { cls: "kansidian-list-enum-editor" });
		const choices = vocabulary.includes(current) ? vocabulary : [current, ...vocabulary];
		for (const opt of choices) {
			const el = select.createEl("option", { text: opt, value: opt });
			if (opt === current) el.selected = true;
		}

		const cleanup = (): void => {
			cell.empty();
			cell.setText(item.enums[which] ?? "");
		};
		select.addEventListener("change", () => {
			const next = select.value;
			if (next === current) {
				cleanup();
				return;
			}
			const field: EnumField =
				which === "status"
					? "Status"
					: item.raw["horizon"] !== undefined
						? "Horizon"
						: "Priority";
			const file = this.findFile(item);
			if (!file) {
				cleanup();
				return;
			}
			void this.plugin.applyEnumChange(file, field, next);
			// Re-render after the index emits 'changed'.
		});
		select.addEventListener("blur", cleanup);
		select.focus();
	}

	private findFile(item: ParsedItem): TFile | null {
		for (const f of this.app.vault.getMarkdownFiles()) {
			const parsed = this.plugin.index.get(f);
			if (parsed?.id === item.id) return f;
		}
		return null;
	}
}

function sortedUnique(values: Array<string | undefined>): string[] {
	const set = new Set<string>();
	for (const v of values) {
		if (typeof v === "string" && v.length > 0) set.add(v);
	}
	return Array.from(set).sort();
}
