import { Notice, Plugin, TFile, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	type KansidianSettings,
	KansidianSettingTab,
} from "./settings";
import { ItemIndex } from "./item-index";
import { updateBoldKeyEnum } from "./writer";
import { KANSIDIAN_BOARD_VIEW_TYPE, KansidianBoardView } from "./views/board-view";
import { KANSIDIAN_LIST_VIEW_TYPE, KansidianListView } from "./views/list-view";

const STATUS_CYCLE = ["open", "in-progress", "done"] as const;
const HORIZON_CYCLE = ["now", "next", "sooner", "soon", "later", "someday"] as const;

function isMarkdownFile(file: TAbstractFile | null): file is TFile {
	return file instanceof TFile && file.extension === "md";
}

function nextInCycle(current: string | undefined, cycle: readonly string[]): string {
	if (!current) return cycle[0]!;
	const i = cycle.indexOf(current);
	return cycle[(i + 1) % cycle.length] ?? cycle[0]!;
}

export default class KansidianPlugin extends Plugin {
	settings!: KansidianSettings;
	index!: ItemIndex;

	async onload() {
		await this.loadSettings();

		this.index = new ItemIndex(this.app.vault, {
			scanPaths: this.collectScanPaths(),
		});

		this.addSettingTab(new KansidianSettingTab(this.app, this));

		this.registerView(
			KANSIDIAN_BOARD_VIEW_TYPE,
			(leaf) => new KansidianBoardView(leaf, this.index),
		);
		this.registerView(
			KANSIDIAN_LIST_VIEW_TYPE,
			(leaf) => new KansidianListView(leaf, this.index),
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
			this.index.setScanPaths(this.collectScanPaths());
			void this.index.rebuild();
		}
	}

	private collectScanPaths(): string[] {
		// Default to both the legacy backlog/ path and the current issues/ path,
		// plus milestones/. Supports the convention drift between Saive's BL-*
		// layout and the current SweetClaude framework's I-* layout.
		return [
			this.settings.backlogPath,
			this.settings.issuesPath,
			this.settings.milestonesPath,
		].filter((p): p is string => typeof p === "string" && p.length > 0);
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
			const nextEnum = nextInCycle(item.enums.status, STATUS_CYCLE);
			void this.applyEnumChange(file, "Status", nextEnum);
			return true;
		}

		// which === "horizon"
		if (item.enums.horizon === undefined) return false;
		if (checking) return true;
		const nextEnum = nextInCycle(item.enums.horizon, HORIZON_CYCLE);
		// Write to whichever field name the file actually uses on disk.
		const fieldName = item.raw["horizon"] !== undefined ? "Horizon" : "Priority";
		void this.applyEnumChange(file, fieldName, nextEnum);
		return true;
	}

	private async applyEnumChange(file: TFile, field: string, newEnum: string): Promise<void> {
		const content = await this.app.vault.read(file);
		const next = updateBoldKeyEnum(content, field, newEnum);
		if (next === content) return;
		await this.app.vault.modify(file, next);
		new Notice(`Kansidian: ${field} → ${newEnum}`);
	}
}
