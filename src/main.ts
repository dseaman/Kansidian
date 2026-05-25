import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, KansidianSettings, KansidianSettingTab } from "./settings";

export default class KansidianPlugin extends Plugin {
	settings!: KansidianSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new KansidianSettingTab(this.app, this));
		console.debug("Kansidian: loaded (scaffold only — views and parser arrive in subsequent issues)");
	}

	onunload() {
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
	}
}
