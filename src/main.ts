import { Notice, Plugin, TFile, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import {
	collectScanPaths,
	DEFAULT_SETTINGS,
	type KansidianSettings,
	KansidianSettingTab,
} from "./settings";
import { ItemIndex } from "./item-index";
import { updateBoldKeyEnum } from "./writer";
import { KANSIDIAN_BOARD_VIEW_TYPE, KansidianBoardView } from "./views/board-view";
import { KANSIDIAN_LIST_VIEW_TYPE, KansidianListView } from "./views/list-view";

function isMarkdownFile(file: TAbstractFile | null): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

function nextInCycle(current: string | undefined, cycle: readonly string[]): string {
	if (cycle.length === 0) return current ?? "";
	if (!current) return cycle[0]!;
	const i = cycle.indexOf(current);
	if (i === -1) return cycle[0]!;
	return cycle[(i + 1) % cycle.length]!;
}

export default class KansidianPlugin extends Plugin {
	settings!: KansidianSettings;
	index!: ItemIndex;

	async onload() {
		await this.loadSettings();

		this.index = new ItemIndex(this.app.vault, {
			scanPaths: collectScanPaths(this.settings),
		});

		this.addSettingTab(new KansidianSettingTab(this.app, this));

		this.registerView(
			KANSIDIAN_BOARD_VIEW_TYPE,
			(leaf) => new KansidianBoardView(leaf, this),
		);
		this.registerView(
			KANSIDIAN_LIST_VIEW_TYPE,
			(leaf) => new KansidianListView(leaf, this),
		);

		this.addCommand({
			id: "open-board",
			name: "Open board",
			callback: () => void this.activateView(KANSIDIAN_BOARD_VIEW_TYPE),
		});
		this.addCommand({
			id: "open-list",
			name: "Open list",
			callback: () => void this.activateView(KANSIDIAN_LIST_VIEW_TYPE),
		});
		this.addCommand({
			id: "cycle-status",
			name: "Cycle status forward",
			checkCallback: (checking) => this.cycleActiveFile(checking, "status"),
		});
		this.addCommand({
			id: "cycle-horizon",
			name: "Cycle horizon forward",
			checkCallback: (checking) => this.cycleActiveFile(checking, "horizon"),
		});
		this.addCommand({
			id: "rescan-and-hint",
			name: "Rescan vault and show cache hint",
			callback: () => void this.rescanAndHint(),
		});

		// Wire vault events. Use registerEvent so unload cleans listeners up.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isMarkdownFile(file)) void this.index.onFileModified(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (isMarkdownFile(file)) void this.index.onFileCreated(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (isMarkdownFile(file)) this.index.onFileDeleted(file);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (isMarkdownFile(file)) void this.index.onFileRenamed(file, oldPath);
			}),
		);

		// Initial scan happens after layout is ready so vault is fully populated.
		this.app.workspace.onLayoutReady(() => {
			void this.index.rebuild();
		});

		console.debug("Kansidian: loaded");
	}

	onunload() {
		// View leaves are detached by Obsidian via registerView lifecycle.
		console.debug("Kansidian: unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<KansidianSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Settings may have changed scan paths.
		if (this.index) {
			this.index.setScanPaths(collectScanPaths(this.settings));
			void this.index.rebuild();
		}
	}

	private async activateView(viewType: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(viewType);
		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]!);
			return;
		}
		const leaf: WorkspaceLeaf | null = workspace.getLeaf("tab");
		if (!leaf) return;
		await leaf.setViewState({ type: viewType, active: true });
		await workspace.revealLeaf(leaf);
	}

	private cycleActiveFile(checking: boolean, which: "status" | "horizon"): boolean {
		const file = this.app.workspace.getActiveFile();
		if (!file || !isMarkdownFile(file)) return false;

		const item = this.index.get(file);
		if (!item) return false;

		if (which === "status") {
			if (item.enums.status === undefined) return false;
			if (checking) return true;
			const nextEnum = nextInCycle(item.enums.status, this.settings.statusEnums);
			void this.applyEnumChange(file, "Status", nextEnum);
			return true;
		}

		// which === "horizon"
		if (item.enums.horizon === undefined) return false;
		if (checking) return true;
		const nextEnum = nextInCycle(item.enums.horizon, this.settings.horizonEnums);
		// Write to whichever field name the file actually uses on disk.
		const fieldName = item.raw["horizon"] !== undefined ? "Horizon" : "Priority";
		void this.applyEnumChange(file, fieldName, nextEnum);
		return true;
	}

	private async rescanAndHint(): Promise<void> {
		await this.index.rebuild();
		new Notice(
			"Kansidian index rebuilt. SweetClaude's cached session-status.txt does not refresh on Obsidian-driven writes — run /sweetclaude:status in Claude Code (or edit a watched state file) to refresh it.",
			8000,
		);
	}

	async applyEnumChange(file: TFile, field: string, newEnum: string): Promise<void> {
		const content = await this.app.vault.read(file);
		const next = updateBoldKeyEnum(content, field, newEnum);
		if (next === content) return;
		await this.app.vault.modify(file, next);
		new Notice(`Kansidian: ${field} → ${newEnum}`);
	}
}
