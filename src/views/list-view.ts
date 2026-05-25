import { ItemView, WorkspaceLeaf } from "obsidian";
import type { ItemIndex } from "../item-index";

export const KANSIDIAN_LIST_VIEW_TYPE = "kansidian-list";

export class KansidianListView extends ItemView {
	private readonly index: ItemIndex;
	private unsubscribe?: () => void;

	constructor(leaf: WorkspaceLeaf, index: ItemIndex) {
		super(leaf);
		this.index = index;
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
		this.unsubscribe = this.index.subscribe(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
	}

	private render(): void {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.createEl("h2", { text: "Kansidian list" });
		const items = this.index.all();
		container.createEl("p", {
			text: `Indexed ${items.length} item${items.length === 1 ? "" : "s"}. Table layout arrives in I-005.`,
		});
	}
}
