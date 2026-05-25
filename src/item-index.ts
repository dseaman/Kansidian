// In-memory index of parsed SweetClaude items. Owned by the plugin; rebuilt
// from disk on every load. Subscribers re-render when an item's enums actually
// change — pure-file mutations that don't shift enums emit `noop`.

import type { TFile, Vault } from "obsidian";
import { parseSweetClaudeFile, type ParsedItem } from "./parser";

export type IndexChange =
	| { kind: "added"; id: string }
	| { kind: "changed"; id: string }
	| { kind: "removed"; id: string }
	| { kind: "noop" };

export type IndexListener = (change: IndexChange) => void;

export interface ItemIndexOptions {
	scanPaths: string[]; // vault-relative dirs, e.g. ["product/backlog", "product/issues", "product/milestones"]
}

function isMarkdown(path: string): boolean {
	return path.toLowerCase().endsWith(".md");
}

function startsWithAny(path: string, prefixes: string[]): boolean {
	const normalised = path.replace(/^\/+/, "");
	for (const p of prefixes) {
		const prefix = p.replace(/\/+$/, "");
		if (normalised === prefix || normalised.startsWith(`${prefix}/`)) return true;
	}
	return false;
}

export class ItemIndex {
	private readonly items = new Map<TFile, ParsedItem>();
	private readonly listeners = new Set<IndexListener>();
	private readonly vault: Vault;
	private scanPaths: string[];

	constructor(vault: Vault, options: ItemIndexOptions) {
		this.vault = vault;
		this.scanPaths = options.scanPaths;
	}

	setScanPaths(paths: string[]): void {
		this.scanPaths = paths;
	}

	async rebuild(): Promise<void> {
		this.items.clear();
		const files = this.vault.getMarkdownFiles();
		for (const file of files) {
			if (!startsWithAny(file.path, this.scanPaths)) continue;
			await this.indexFile(file, { silent: true });
		}
		this.emit({ kind: "noop" });
	}

	subscribe(listener: IndexListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	all(): ParsedItem[] {
		return Array.from(this.items.values());
	}

	// entries() preserves the TFile reference for each item. Use this in views
	// to avoid id-based lookups, which mis-resolve when two files share an id
	// (a Saive-style data issue we must tolerate non-destructively).
	entries(): Array<[TFile, ParsedItem]> {
		return Array.from(this.items.entries());
	}

	byStatus(status: string): ParsedItem[] {
		return this.all().filter((i) => i.enums.status === status);
	}

	byMilestone(milestoneId: string): ParsedItem[] {
		return this.all().filter((i) => i.enums.milestone === milestoneId);
	}

	get(file: TFile): ParsedItem | undefined {
		return this.items.get(file);
	}

	async onFileModified(file: TFile): Promise<void> {
		if (!this.tracks(file)) return;
		const previous = this.items.get(file);
		await this.indexFile(file, { silent: false, previous });
	}

	async onFileCreated(file: TFile): Promise<void> {
		if (!this.tracks(file)) return;
		await this.indexFile(file, { silent: false });
	}

	onFileDeleted(file: TFile): void {
		const existing = this.items.get(file);
		if (!existing) return;
		this.items.delete(file);
		this.emit({ kind: "removed", id: existing.id });
	}

	async onFileRenamed(file: TFile, oldPath: string): Promise<void> {
		// Drop any entry that was keyed by the old TFile reference.
		// Vault may reuse the TFile or hand us a fresh one — defensive cleanup.
		for (const [key, item] of this.items) {
			if (key.path === oldPath) {
				this.items.delete(key);
				this.emit({ kind: "removed", id: item.id });
				break;
			}
		}
		if (!this.tracks(file)) return;
		await this.indexFile(file, { silent: false });
	}

	private tracks(file: TFile): boolean {
		return isMarkdown(file.path) && startsWithAny(file.path, this.scanPaths);
	}

	private async indexFile(
		file: TFile,
		opts: { silent: boolean; previous?: ParsedItem },
	): Promise<void> {
		const content = await this.vault.read(file);
		const parsed = parseSweetClaudeFile(content);

		if (!parsed) {
			if (opts.previous) {
				this.items.delete(file);
				if (!opts.silent) this.emit({ kind: "removed", id: opts.previous.id });
			}
			return;
		}

		this.items.set(file, parsed);
		if (opts.silent) return;

		if (!opts.previous) {
			this.emit({ kind: "added", id: parsed.id });
			return;
		}
		if (enumsEqual(opts.previous, parsed)) {
			this.emit({ kind: "noop" });
		} else {
			this.emit({ kind: "changed", id: parsed.id });
		}
	}

	private emit(change: IndexChange): void {
		for (const listener of this.listeners) listener(change);
	}
}

function enumsEqual(a: ParsedItem, b: ParsedItem): boolean {
	const ae = a.enums;
	const be = b.enums;
	if (ae.status !== be.status) return false;
	if (ae.horizon !== be.horizon) return false;
	if (ae.milestone !== be.milestone) return false;
	if (ae.dependsOn.length !== be.dependsOn.length) return false;
	for (let i = 0; i < ae.dependsOn.length; i++) {
		if (ae.dependsOn[i] !== be.dependsOn[i]) return false;
	}
	return a.title === b.title;
}
