# CLAUDE.md

## Project

AC Mod Toolkit — cross-platform desktop app (macOS, Linux, Windows) for extracting, editing, repacking Assetto Corsa car/track mod textures. Tauri v2 + Vue 3 + TypeScript frontend, Rust backend.

## Stack

| Layer | Tool | Version |
|-------|------|---------|
| Runtime | Bun | 1.3.11 |
| Desktop shell | Tauri | v2 (latest) |
| Frontend | Vue 3 + TypeScript | latest |
| UI components | shadcn-vue (Radix Vue + Tailwind) | latest |
| Linter/Formatter | Biome | latest |
| Task runner | Taskfile (go-task) | latest |
| Backend | Rust (stable) | latest |
| Tests (frontend) | Vitest | latest |
| Tests (Rust) | cargo test | built-in |

## Rules — follow every single one, no exceptions

### Code quality

- **DRY**: no duplicate logic. Extract shared code into composables, utils, or Rust modules.
- **SRP**: every file, function, component, module does one thing.
- **Self-documenting**: names explain intent. Comments only for *why*, never *what*. Need comment to explain what? Rename until you don't.
- **Small files**: exceeds ~150 lines → split.
- **Barrel exports**: every dir with multiple public exports gets `index.ts` or `mod.rs`.
- **Types over `any`**: never use `any` or `unknown` unless wrapping external API.
- **Error handling**: always explicit. No silent catches. No `unwrap()` in Rust prod — use `?` and proper error types.
- **No magic strings/numbers**: extract constants.

### Git

- Make a new branch from main following the Conventional Commits format for the branch name before every task
- Commit after every completed task (see PLAN.md).
- Commit message format: [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Examples: `feat: add kn5 binary parser`, `fix: resolve texture decode error`, `refactor: extract scan logic to module`.
- **Never add co-author trailers.**
- **Never mention yourself, AI, Claude, LLM, agent, or assistant in commits, code, comments, or any file.**
- **Never commit CLAUDE.md or PLAN.md. Never add them to .gitignore either — they simply don't get staged.**
- Use `git add <specific files>` — never `git add .` or `git add -A`.

### Task execution

- Before each task: check remaining context. Below 30% → compact first.
- After each task: run `task lint` then `task test`. Fix failures before committing.
- Lint/test fail → fix same task, don't commit broken code.
- **Before committing any UI change: tell the user to run `task dev` and confirm it works visually. Only commit after they confirm.**
- After committing, tell user: "Ready to test — run `task dev` to try it out." Only when task adds/changes something visually verifiable.

### Testing

- **100% coverage** on all frontend composables, utils, stores.
- **100% coverage** on all Rust commands, parsers, converters.
- Components: test behavior (interactions, emitted events, rendered state), not implementation details.
- Rust: unit tests per module, integration tests for command flows.
- Use `vitest` frontend, `cargo test` Rust.
- Mock Tauri IPC (`@tauri-apps/api`) in frontend tests.
- Run `task test:coverage` before completing any task that adds logic.
- **Composable tests**: always call via `withSetup` helper wrapping in `defineComponent` + `mount()` — ensures `onMounted`/`onUnmounted` run correctly, avoids lifecycle warnings. Await `nextTick()` after mount before asserting.

### Formatting and linting

- Biome: all JS/TS/Vue formatting + linting. No ESLint, no Prettier.
- `rustfmt`: Rust formatting.
- `clippy`: Rust linting with `-D warnings`.
- Run `task lint` after every change.
- Run `task format` to auto-fix.
- **Vue import lint**: Biome can't analyse template usage. Imports/variables used only in `<template>` → list in `defineExpose({ ... })` at end of `<script setup>`.

### Frontend conventions

- Vue 3 Composition API with `<script setup lang="ts">` only. No Options API.
- Shared state → composables (`use*.ts` in `composables/`), never prop-drilled >2 levels.
- Tauri commands wrapped in typed async functions in `lib/tauri.ts` — components never call `invoke()` directly.
- All types in `types/index.ts` with named exports.
- shadcn-vue components added via CLI (`bunx shadcn-vue@latest add <component>`), not manually.
- Tailwind only — no inline `style=`, no CSS files beyond `globals.css`.
- Use `VueUse` composables when available.

### Rust conventions

- Tauri commands → `commands/`, one file per domain.
- Binary format parsing → `parsers/`.
- Image conversion → `converters/`.
- Data structures → `models/`.
- Use `thiserror` for custom error types — no `String` errors in library code.
- Use `serde` for all IPC serialization.
- Use `binrw` for binary format parsing.
- Each module has `mod.rs` re-exporting public API.

### Taskfile

All commands via `task <name>`. Taskfile.yml is single source of truth. Never reference bun/cargo commands directly — always use task name.

## File structure reference

See PLAN.md task 01 for complete project structure. Follow exactly.

## Design reference

Six mockup images (`mockup_01` through `mockup_06`) in project root. Definitive visual spec — match pixel-for-pixel: layout, spacing, typography, color. See design tokens table in PLAN.md for exact values. Mockup wins over any written description.