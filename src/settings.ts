import { App, PluginSettingTab } from "obsidian";
import type KansidianPlugin from "./main";

export interface KansidianSettings {
	backlogPath: string;
	milestonesPath: string;
}

export const DEFAULT_SETTINGS: KansidianSettings = {
	backlogPath: "product/backlog",
	milestonesPath: "product/milestones",
};

export class KansidianSettingTab extends PluginSettingTab {
	plugin: KansidianPlugin;

	constructor(app: App, plugin: KansidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			text: "Kansidian is in pre-alpha scaffolding. Real settings arrive with a later issue.",
		});
	}
}
