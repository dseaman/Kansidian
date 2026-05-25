# Kansidian

> **Status:** PRE-ALPHA — scaffolding only. The plugin does not do anything useful yet.

An Obsidian plugin that gives [SweetClaude](https://github.com/quantmeta-labs/sweetclaude) users a non-destructive Kanban view of their project backlog and milestones.

Kansidian reads SweetClaude's native bold-key markdown directly. It surfaces backlog items and milestones in board and list views, lets you drag to cycle status or reassign milestones, and writes changes back to the same files with annotations preserved byte-identical. SweetClaude in Claude Code remains the primary working interface — Kansidian is a visibility layer alongside it.

## How it works (vault model)

Kansidian assumes you open your project's `.sweetclaude/` directory itself as the Obsidian vault — not the project root. This sidesteps Obsidian's default behaviour of skipping dotfiles and dotdirs. The vault root becomes `.sweetclaude/`; `product/backlog/`, `product/milestones/`, `state/`, etc. are regular directories from Obsidian's perspective.

```text
your-project/
├── src/                          # your code (not in the vault)
└── .sweetclaude/                 # ← open THIS as your Obsidian vault
    ├── product/
    │   ├── backlog/   *.md       # ← Kansidian renders these as cards
    │   └── milestones/ *.md      # ← and these as columns / linkable targets
    └── state/
```

If you want to navigate your project code as well, open a second Obsidian window with your project root as that vault.

## Install (BRAT)

Kansidian is not yet in the Obsidian community plugin store. For now, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install BRAT from Community Plugins.
2. In BRAT settings → **Add Beta Plugin**, paste: `https://github.com/dseaman/Kansidian`.
3. Enable **Kansidian (SweetClaude Kanban)** in Community Plugins.
4. Open your project's `.sweetclaude/` directory as the active Obsidian vault.
5. Command palette → **Open Kansidian board** (or **Open Kansidian list**).

## Develop

```bash
npm install
npm run dev    # esbuild watch — emits main.js at repo root
npm run build  # tsc -noEmit + esbuild production
npm run lint   # ESLint with eslint-plugin-obsidianmd
```

To test against your own SweetClaude vault while iterating, symlink the built plugin into the target vault's `.obsidian/plugins/kansidian/`:

```bash
mkdir -p /path/to/your-project/.sweetclaude/.obsidian/plugins/kansidian
ln -sf "$PWD/main.js" /path/to/your-project/.sweetclaude/.obsidian/plugins/kansidian/main.js
ln -sf "$PWD/manifest.json" /path/to/your-project/.sweetclaude/.obsidian/plugins/kansidian/manifest.json
ln -sf "$PWD/styles.css" /path/to/your-project/.sweetclaude/.obsidian/plugins/kansidian/styles.css
```

## Known: SweetClaude cache staleness after Obsidian-driven writes

SweetClaude regenerates its cached `.sweetclaude/state/session-status.txt` via a Claude Code `PostToolUse` hook that fires after Claude Code's own `Write`/`Edit` tool calls. Obsidian's `vault.modify` writes do not go through Claude Code, so the hook does not fire, and the cache goes stale until something else triggers regeneration.

Practical impact: after using Kansidian to drag cards or cycle enums, your project's cached `session-status.txt` shows pre-edit data. Slash commands that recompute from disk (`/sweetclaude:status`) are unaffected — they show live truth. Slash commands or memory tools that read the cached file will show stale data.

Refresh options:
- Run `/sweetclaude:status` in Claude Code — recomputes from disk (doesn't write the cache, but you see fresh state).
- Edit any file in the framework's watched set (e.g. add a noop line to `state/checkpoint.md`) — triggers the regenerator.
- Start a new Claude Code session — preflight regenerates.

Kansidian's own in-memory index stays in sync with the vault via Obsidian's file-watcher events. The staleness is exclusive to SweetClaude's framework caches, not Kansidian's.

The command palette entry **Kansidian: Rescan vault and show cache hint** rebuilds Kansidian's index and shows a Notice with the refresh paths above.

## Design

See [`.sweetclaude/technical/architecture.md`](./.sweetclaude/technical/architecture.md) for the architecture and Architectural Decision Records. The load-bearing decisions:

- **Bold-key splice with annotation preservation** (ADR-002) — writes never overwrite annotations like `done (merged 2026-05-19, PR #29)`
- **Vault-as-`.sweetclaude/`** (ADR-010) — sidesteps Obsidian's dotdir limitation
- **MVP scope = backlog items + milestones only** (ADR-007) — epics, sprints, stories deferred
- **No item creation in MVP** (ADR-011) — deferred to post-MVP gated on compatibility audit

## License

[MIT](./LICENSE) — Dan Seaman, 2026.
