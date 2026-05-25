// Renders a friendly explanation when the project's SweetClaude mode isn't
// the kind of work-tracking Kansidian's views were built for.

import type { ProjectMode } from "../main";

interface PlaceholderCopy {
	heading: string;
	body: string;
	hint?: string;
}

const COPY: Record<ProjectMode, PlaceholderCopy | null> = {
	unset: null, // unset → render normally (Saive-style projects with no mode field)
	kanban: null,
	agile: null,
	agile_enterprise: null,
	flow: {
		heading: "Flow mode — work is inferred, not tracked",
		body: "Flow mode is for early-exploration solo work where SweetClaude infers what you're doing without ceremony. There aren't tracked work items to render here.",
		hint: "Switch to kanban or agile mode in SweetClaude (set mode in state/phase.yaml) when you want a board.",
	},
	shape_up: {
		heading: "Shape Up mode — no backlog by design",
		body: "In Shape Up mode, new work enters through pitches with a fixed appetite, not a backlog. The kanban board doesn't apply here.",
		hint: "A pitch-board view is on the Kansidian roadmap. For now, browse pitches in Obsidian's native pane.",
	},
};

export function shouldShowPlaceholder(mode: ProjectMode): boolean {
	return COPY[mode] !== null;
}

export function renderModePlaceholder(root: Element, mode: ProjectMode): void {
	const copy = COPY[mode];
	if (!copy) return;
	const wrapper = root.createDiv({ cls: "kansidian-mode-placeholder" });
	wrapper.createEl("h3", { text: copy.heading });
	wrapper.createEl("p", { text: copy.body });
	if (copy.hint) {
		wrapper.createEl("p", { text: copy.hint, cls: "kansidian-mode-placeholder-hint" });
	}
}

export function modeBadge(mode: ProjectMode): string {
	return mode === "unset" ? "mode unset" : mode;
}
