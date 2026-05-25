import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type KansidianPlugin from "../main";
import type { ParsedItem } from "../parser";

export const KANSIDIAN_BOARD_VIEW_TYPE = "kansidian-board";

interface BoardFilters {
	search: string;
	horizon: string;
	milestone: string;
}

const DRAG_MIME = "application/x-kansidian-item-id";

export class KansidianBoardView extends ItemView {
	private readonly plugin: KansidianPlugin;
	private unsubscribe?: () => void;
	private filters: BoardFilters = { search: "", horizon: "", milestone: "" };

	constructor(leaf: WorkspaceLeaf, plugin: KansidianPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return KANSIDIAN_BOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Kansidian board";
	}

	getIcon(): string {
		return "kanban-square";
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
		root.addClass("kansidian-board-root");

		const items = this.plugin.index.all();
		const filtered = this.applyFilters(items);

		const header = root.createDiv({ cls: "kansidian-board-header" });
		header.createEl("h2", { text: `Kansidian board (${filtered.length} of ${items.length})` });

		this.renderToolbar(root.createDiv({ cls: "kansidian-board-toolbar" }), items);

		const columnsContainer = root.createDiv({ cls: "kansidian-board-columns" });
		const columnNames = this.deriveColumns(filtered);

		for (const columnName of columnNames) {
			this.renderColumn(columnsContainer, columnName, filtered);
		}

		if (columnNames.length === 0) {
			columnsContainer.createEl("p", {
				text: items.length === 0
					? "No items in the index yet. Check the configured paths in settings."
					: "No items match the current filters.",
			});
		}
	}

	private applyFilters(items: ParsedItem[]): ParsedItem[] {
		const { search, horizon, milestone } = this.filters;
		const needle = search.trim().toLowerCase();
		return items.filter((item) => {
			if (horizon && item.enums.horizon !== horizon) return false;
			if (milestone && item.enums.milestone !== milestone) return false;
			if (item.kind !== "backlog") return false; // board surfaces backlog items only
			if (needle) {
				const haystack = `${item.id} ${item.title}`.toLowerCase();
				if (!haystack.includes(needle)) return false;
			}
			return true;
		});
	}

	private deriveColumns(items: ParsedItem[]): string[] {
		// Start with the configured status vocabulary, then add any extras
		// present in the data so nothing gets hidden.
		const configured = this.plugin.settings.statusEnums;
		const inData = new Set<string>();
		for (const i of items) {
			if (i.enums.status) inData.add(i.enums.status);
		}
		const result: string[] = [];
		for (const s of configured) {
			if (inData.has(s) || items.length === 0) result.push(s);
			inData.delete(s);
		}
		for (const extra of Array.from(inData).sort()) {
			result.push(extra);
		}
		return result;
	}

	private renderToolbar(toolbar: HTMLElement, items: ParsedItem[]): void {
		const searchInput = toolbar.createEl("input", {
			type: "search",
			placeholder: "Search id or title…",
			cls: "kansidian-board-search",
		});
		searchInput.value = this.filters.search;
		searchInput.addEventListener("input", () => {
			this.filters.search = searchInput.value;
			this.render();
		});

		const uniqueHorizons = sortedUnique(items.map((i) => i.enums.horizon));
		const uniqueMilestones = sortedUnique(items.map((i) => i.enums.milestone));
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
		const select = parent.createEl("select", { cls: `kansidian-board-filter kansidian-board-filter-${label}` });
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

	private renderColumn(parent: HTMLElement, status: string, items: ParsedItem[]): void {
		const column = parent.createDiv({ cls: "kansidian-board-column" });
		const inColumn = items.filter((i) => (i.enums.status ?? "") === status);

		const head = column.createDiv({ cls: "kansidian-board-column-head" });
		head.createEl("span", { text: status, cls: "kansidian-board-column-name" });
		head.createEl("span", { text: String(inColumn.length), cls: "kansidian-board-column-count" });

		column.dataset["status"] = status;

		column.addEventListener("dragover", (event) => {
			event.preventDefault();
			column.addClass("kansidian-board-column-dropping");
		});
		column.addEventListener("dragleave", () => {
			column.removeClass("kansidian-board-column-dropping");
		});
		column.addEventListener("drop", (event) => {
			event.preventDefault();
			column.removeClass("kansidian-board-column-dropping");
			const id = event.dataTransfer?.getData(DRAG_MIME);
			if (!id) return;
			this.moveItemToStatus(id, status);
		});

		const list = column.createDiv({ cls: "kansidian-board-cards" });
		for (const item of inColumn) {
			this.renderCard(list, item);
		}
	}

	private renderCard(parent: HTMLElement, item: ParsedItem): void {
		const card = parent.createDiv({ cls: "kansidian-board-card" });
		card.draggable = true;
		card.dataset["id"] = item.id;

		card.createDiv({ cls: "kansidian-board-card-id", text: item.id });
		card.createDiv({ cls: "kansidian-board-card-title", text: item.title });

		const meta = card.createDiv({ cls: "kansidian-board-card-meta" });
		if (item.enums.milestone) {
			meta.createEl("span", {
				text: item.enums.milestone,
				cls: "kansidian-board-card-milestone",
			});
		}
		if (item.enums.horizon) {
			meta.createEl("span", {
				text: item.enums.horizon,
				cls: "kansidian-board-card-horizon-chip",
			});
		}

		card.addEventListener("dragstart", (event) => {
			event.dataTransfer?.setData(DRAG_MIME, item.id);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			card.addClass("kansidian-board-card-dragging");
		});
		card.addEventListener("dragend", () => {
			card.removeClass("kansidian-board-card-dragging");
		});
		card.addEventListener("click", () => {
			const file = this.findFile(item.id);
			if (file) void this.app.workspace.getLeaf("tab").openFile(file);
		});
	}

	private moveItemToStatus(itemId: string, targetStatus: string): void {
		const file = this.findFile(itemId);
		if (!file) return;
		const item = this.plugin.index.get(file);
		if (!item) return;
		if (item.enums.status === targetStatus) return;
		void this.plugin.applyEnumChange(file, "Status", targetStatus);
	}

	private findFile(id: string): TFile | null {
		for (const f of this.app.vault.getMarkdownFiles()) {
			const parsed = this.plugin.index.get(f);
			if (parsed?.id === id) return f;
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
