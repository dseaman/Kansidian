import { ItemView, Menu, TFile, WorkspaceLeaf } from "obsidian";
import type KansidianPlugin from "../main";
import type { ParsedItem } from "../parser";
import { captureFocus, restoreFocus } from "./preserve-focus";

const FOCUSABLE_SELECTORS = [".kansidian-list-search"];

export const KANSIDIAN_LIST_VIEW_TYPE = "kansidian-list";

interface ListFilters {
	search: string;
	status: string;
	horizon: string;
	milestone: string;
}

type EnumField = "Status" | "Horizon" | "Priority";

type Entry = [TFile, ParsedItem];

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
		const focusSnapshot = captureFocus(this.containerEl, FOCUSABLE_SELECTORS);
		try {
			root.empty();
			root.addClass("kansidian-list-root");

			const entries = this.plugin.index.entries();
			const filtered = this.applyFilters(entries);

			const header = root.createDiv({ cls: "kansidian-list-header" });
			header.createEl("h2", { text: `Kansidian list (${filtered.length} of ${entries.length})` });

			this.renderToolbar(root.createDiv({ cls: "kansidian-list-toolbar" }), entries);

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
					entries.length === 0
						? "No items in the index yet. Check the configured paths in settings."
						: "No items match the current filters.",
				);
				return;
			}

			for (const [file, item] of filtered) {
				this.renderRow(tbody, file, item);
			}
		} finally {
			restoreFocus(this.containerEl, focusSnapshot);
		}
	}

	private applyFilters(entries: Entry[]): Entry[] {
		const { search, status, horizon, milestone } = this.filters;
		const needle = search.trim().toLowerCase();
		return entries.filter(([, item]) => {
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

	private renderToolbar(toolbar: HTMLElement, entries: Entry[]): void {
		const searchWrapper = toolbar.createDiv({ cls: "kansidian-search-wrapper" });
		const searchInput = searchWrapper.createEl("input", {
			type: "search",
			placeholder: "Search id or title…",
			cls: "kansidian-list-search",
		});
		searchInput.value = this.filters.search;
		searchInput.addEventListener("input", () => {
			this.filters.search = searchInput.value;
			this.render();
		});
		const clearBtn = searchWrapper.createEl("button", {
			cls: "kansidian-search-clear",
			text: "✕",
			attr: { type: "button", "aria-label": "Clear search" },
		});
		clearBtn.addEventListener("click", () => {
			this.filters.search = "";
			this.render();
			const refocus = this.containerEl.querySelector<HTMLInputElement>(".kansidian-list-search");
			refocus?.focus();
		});

		const items = entries.map(([, item]) => item);
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

	private renderRow(tbody: HTMLElement, file: TFile, item: ParsedItem): void {
		const row = tbody.createEl("tr", { cls: "kansidian-list-row" });

		const idCell = row.createEl("td", { text: item.id, cls: "kansidian-list-id" });
		const titleCell = row.createEl("td", { text: item.title, cls: "kansidian-list-title" });
		const statusCell = row.createEl("td", { cls: "kansidian-list-cell-enum" });
		const horizonCell = row.createEl("td", { cls: "kansidian-list-cell-enum" });
		row.createEl("td", { text: item.enums.milestone ?? "", cls: "kansidian-list-milestone" });
		row.createEl("td", { text: item.raw["scope"] ?? "", cls: "kansidian-list-scope" });

		this.renderEnumCell(statusCell, file, item, "status", this.plugin.settings.statusEnums);
		this.renderEnumCell(horizonCell, file, item, "horizon", this.plugin.settings.horizonEnums);

		const openFile = (): void => {
			void this.app.workspace.getLeaf("tab").openFile(file);
		};
		idCell.addEventListener("click", openFile);
		titleCell.addEventListener("click", openFile);
	}

	private renderEnumCell(
		cell: HTMLElement,
		file: TFile,
		item: ParsedItem,
		which: "status" | "horizon",
		vocabulary: string[],
	): void {
		const current = item.enums[which] ?? "";
		cell.empty();
		cell.setText(current);

		if (vocabulary.length === 0) return;

		cell.addEventListener("click", (event) => {
			event.stopPropagation();
			this.openEnumMenu(event, file, item, which, vocabulary, current);
		});
	}

	private openEnumMenu(
		event: MouseEvent,
		file: TFile,
		item: ParsedItem,
		which: "status" | "horizon",
		vocabulary: string[],
		current: string,
	): void {
		const menu = new Menu();
		// Show the current value first if it isn't in the configured vocabulary,
		// so the user can see what the file actually has.
		const choices = vocabulary.includes(current) ? vocabulary : [current, ...vocabulary];

		for (const opt of choices) {
			menu.addItem((menuItem) => {
				menuItem.setTitle(opt);
				if (opt === current) menuItem.setIcon("checkmark");
				menuItem.onClick(() => {
					if (opt === current) return;
					const field: EnumField =
						which === "status"
							? "Status"
							: item.raw["horizon"] !== undefined
								? "Horizon"
								: "Priority";
					void this.plugin.applyEnumChange(file, field, opt);
				});
			});
		}

		menu.showAtMouseEvent(event);
	}
}

function sortedUnique(values: Array<string | undefined>): string[] {
	const set = new Set<string>();
	for (const v of values) {
		if (typeof v === "string" && v.length > 0) set.add(v);
	}
	return Array.from(set).sort();
}
