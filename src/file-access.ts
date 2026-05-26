// Abstracts file I/O so Kansidian can work whether the vault root is
// `.sweetclaude/` itself (legacy: standard Obsidian vault API) or the
// project root with `.sweetclaude/` as a dotdir child (project-root mode:
// must use vault.adapter because the Obsidian indexer skips dotdirs).

import { TFile, type Vault } from "obsidian";

export interface FileAccess {
	// Resolve a logical Kansidian-relative path (e.g. "product/backlog/BL-001.md")
	// to a vault-relative path. Returns the same string in legacy mode; prefixes
	// with ".sweetclaude/" in project-root mode.
	vaultPath(logical: string): string;

	read(logicalPath: string): Promise<string>;
	write(logicalPath: string, content: string): Promise<void>;

	// List all markdown files anywhere under one of the given logical paths.
	// Returns logical (Kansidian-relative) paths.
	listMarkdownUnder(logicalRoots: string[]): Promise<string[]>;

	// Best-effort lookup for an Obsidian TFile. Returns null when the file
	// isn't indexed (project-root mode without a hidden-files plugin).
	getTFile(logicalPath: string): TFile | null;

	// Whether this access strategy is using Obsidian's vault index (true) or
	// going around it via the adapter (false). Used to decide whether vault
	// events will fire for tracked files.
	usesVaultEvents(): boolean;
}

export class VaultAccess implements FileAccess {
	constructor(private readonly vault: Vault) {}

	vaultPath(logical: string): string {
		return logical;
	}

	async read(logicalPath: string): Promise<string> {
		return this.vault.adapter.read(logicalPath);
	}

	async write(logicalPath: string, content: string): Promise<void> {
		const tfile = this.getTFile(logicalPath);
		if (tfile) {
			await this.vault.modify(tfile, content);
		} else {
			await this.vault.adapter.write(logicalPath, content);
		}
	}

	async listMarkdownUnder(logicalRoots: string[]): Promise<string[]> {
		const result: string[] = [];
		const allMd = this.vault.getMarkdownFiles();
		for (const f of allMd) {
			if (matchesAnyRoot(f.path, logicalRoots)) result.push(f.path);
		}
		return result;
	}

	getTFile(logicalPath: string): TFile | null {
		const af = this.vault.getAbstractFileByPath(logicalPath);
		return af instanceof TFile ? af : null;
	}

	usesVaultEvents(): boolean {
		return true;
	}
}

export class ProjectRootAccess implements FileAccess {
	private static readonly PREFIX = ".sweetclaude";

	constructor(private readonly vault: Vault) {}

	vaultPath(logical: string): string {
		if (logical.startsWith(`${ProjectRootAccess.PREFIX}/`) || logical === ProjectRootAccess.PREFIX) {
			return logical;
		}
		return `${ProjectRootAccess.PREFIX}/${logical}`;
	}

	async read(logicalPath: string): Promise<string> {
		return this.vault.adapter.read(this.vaultPath(logicalPath));
	}

	async write(logicalPath: string, content: string): Promise<void> {
		const vp = this.vaultPath(logicalPath);
		// Prefer vault.modify when a TFile exists (e.g. with a hidden-files
		// plugin installed) so vault events fire for the change.
		const tfile = this.getTFile(logicalPath);
		if (tfile) {
			await this.vault.modify(tfile, content);
		} else {
			await this.vault.adapter.write(vp, content);
		}
	}

	async listMarkdownUnder(logicalRoots: string[]): Promise<string[]> {
		const result: string[] = [];
		for (const logicalRoot of logicalRoots) {
			const vp = this.vaultPath(logicalRoot);
			if (!(await this.vault.adapter.exists(vp))) continue;
			await this.walk(vp, result);
		}
		// Map back to logical paths by stripping the .sweetclaude/ prefix.
		return result.map((p) => this.stripPrefix(p));
	}

	getTFile(logicalPath: string): TFile | null {
		const af = this.vault.getAbstractFileByPath(this.vaultPath(logicalPath));
		return af instanceof TFile ? af : null;
	}

	usesVaultEvents(): boolean {
		return false;
	}

	private async walk(dir: string, out: string[]): Promise<void> {
		const listing = await this.vault.adapter.list(dir);
		for (const file of listing.files) {
			if (file.toLowerCase().endsWith(".md")) out.push(file);
		}
		for (const sub of listing.folders) {
			await this.walk(sub, out);
		}
	}

	private stripPrefix(vaultPath: string): string {
		const p = `${ProjectRootAccess.PREFIX}/`;
		return vaultPath.startsWith(p) ? vaultPath.slice(p.length) : vaultPath;
	}
}

function matchesAnyRoot(path: string, roots: string[]): boolean {
	const normalised = path.replace(/^\/+/, "");
	for (const r of roots) {
		const root = r.replace(/\/+$/, "");
		if (root.length === 0) continue;
		if (normalised === root || normalised.startsWith(`${root}/`)) return true;
	}
	return false;
}

// Detect which mode the vault is in by looking for SweetClaude's state file.
// Returns null if neither layout looks valid (no SweetClaude project here).
export async function detectMode(vault: Vault): Promise<"legacy" | "project-root" | null> {
	const adapter = vault.adapter;
	const legacy = await adapter.exists("state/phase.yaml");
	if (legacy) return "legacy";
	const projectRoot = await adapter.exists(".sweetclaude/state/phase.yaml");
	if (projectRoot) return "project-root";
	return null;
}
