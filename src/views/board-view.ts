import { ItemView, WorkspaceLeaf } from "obsidian";
import type KansidianPlugin from "../main";

export const KANSIDIAN_BOARD_VIEW_TYPE = "kansidian-board";

export class KansidianBoardView extends ItemView {
	private readonly plugin: KansidianPlugin;
	private unsubscribe?: () => void;

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
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.createEl("h2", { text: "Kansidian board" });
		const items = this.plugin.index.all();
		container.createEl("p", {
			text: `Indexed ${items.length} item${items.length === 1 ? "" : "s"}. Board layout arrives in I-006.`,
		});
	}
}
