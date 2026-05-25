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

## Design

See [`.sweetclaude/technical/architecture.md`](./.sweetclaude/technical/architecture.md) for the architecture and Architectural Decision Records. The load-bearing decisions:

- **Bold-key splice with annotation preservation** (ADR-002) — writes never overwrite annotations like `done (merged 2026-05-19, PR #29)`
- **Vault-as-`.sweetclaude/`** (ADR-010) — sidesteps Obsidian's dotdir limitation
- **MVP scope = backlog items + milestones only** (ADR-007) — epics, sprints, stories deferred
- **No item creation in MVP** (ADR-011) — deferred to post-MVP gated on compatibility audit

## License

[MIT](./LICENSE) — Dan Seaman, 2026.
