# CLAUDE.md

## Project

AC Mod Toolkit — a cross-platform desktop app (macOS, Linux, Windows) for extracting, editing, and repacking Assetto Corsa car and track mod textures. Built with Tauri v2 + Vue 3 + TypeScript frontend and Rust backend.

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

- **DRY**: never duplicate logic. Extract shared code into composables, utils, or Rust modules.
- **SRP**: every file, function, component, and module does exactly one thing.
- **Self-documenting**: names must explain intent. No comments that restate what code does. Comments only for *why*, never *what*. If you need a comment to explain what code does, rename things until you don't.
- **Small files**: if a file exceeds ~150 lines, split it.
- **Barrel exports**: every directory with multiple public exports has an `index.ts` or `mod.rs`.
- **Types over `any`**: never use `any` or `unknown` unless wrapping an external API.
- **Error handling**: always handle errors explicitly. No silent catches. No `unwrap()` in Rust production code — use `?` and proper error types.
- **No magic strings/numbers**: extract constants.

### Git

- Commit after every completed task (see PLAN.md).
- Commit message format: follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Examples: `feat: add kn5 binary parser`, `fix: resolve texture decode error`, `refactor: extract scan logic to module`.
- **Never add co-author trailers.**
- **Never mention yourself, AI, Claude, LLM, agent, or assistant in commits, code, comments, or any file.**
- **Never commit CLAUDE.md or PLAN.md. Never add them to .gitignore either — they simply don't get staged.**
- Use `git add <specific files>` — never `git add .` or `git add -A` to avoid accidentally staging agent files.

### Task execution

- Before starting each task, check your remaining context window. If it is below 30%, compact your conversation first.
- After each task: run `task lint` then `task test`. Fix any failures before committing.
- If tests or lint fail, fix them in the same task — do not commit broken code.
- After committing, tell the user: "Ready to test — run `task dev` to try it out." Do this only when the task adds or changes something the user can visually verify.

### Testing

- **100% coverage** on all frontend composables, utils, and stores.
- **100% coverage** on all Rust commands, parsers, and converters.
- Components: test behavior (user interactions, emitted events, rendered state), not implementation details.
- Rust: unit tests in each module, integration tests for command flows.
- Use `vitest` for frontend, `cargo test` for Rust.
- Mock Tauri IPC (`@tauri-apps/api`) in frontend tests.
- Run `task test:coverage` to verify 100% before completing any task that adds logic.
- **Composable tests**: always call composables using a `withSetup` helper that wraps them in a `defineComponent` + `mount()` to provide a proper Vue component context. This ensures `onMounted`/`onUnmounted` hooks run correctly and avoids Vue lifecycle warnings. Await `nextTick()` after mount to let async `onMounted` callbacks settle before asserting.

### Formatting and linting

- Biome handles all JS/TS/Vue formatting and linting. No ESLint, no Prettier.
- `rustfmt` handles Rust formatting.
- `clippy` handles Rust linting with `-D warnings` (deny all warnings).
- Run `task lint` after every change — it runs both Biome and Clippy.
- Run `task format` to auto-fix — it runs both Biome and rustfmt.
- **Vue import lint**: Biome cannot analyse template usage. For imports and variables used only in `<template>`, list them in `defineExpose({ ... })` at the end of `<script setup>` — this makes Biome see them as used without suppression comments.

### Frontend conventions

- Vue 3 Composition API with `<script setup lang="ts">` only. No Options API.
- All shared state goes through composables (`use*.ts` in `composables/`), never prop-drilled more than 2 levels.
- Tauri commands are wrapped in typed async functions inside `lib/tauri.ts` — components never call `invoke()` directly.
- All types live in `types/index.ts` with named exports.
- shadcn-vue components are added via CLI (`bunx shadcn-vue@latest add <component>`) not manually.
- Tailwind only — no inline `style=` attributes, no CSS files beyond `globals.css`.
- Use `VueUse` composables when they exist instead of writing your own.

### Rust conventions

- All Tauri commands go in `commands/` with one file per domain.
- All binary format parsing goes in `parsers/`.
- All image conversion goes in `converters/`.
- All data structures go in `models/`.
- Use `thiserror` for custom error types — no `String` errors in library code.
- Use `serde` for all IPC serialization.
- Use `binrw` for binary format parsing.
- Each module has a `mod.rs` that re-exports its public API.

### Taskfile

All commands are run via `task <name>`. The Taskfile.yml is the single source of truth for commands. Never run bun/cargo commands directly in instructions — always reference the task name.

## File structure reference

See PLAN.md task 01 for the complete project structure. Follow it exactly.

## Design reference

Six mockup images (`mockup_01` through `mockup_06`) are provided in the project root. These are the definitive visual spec — match them pixel-for-pixel in terms of layout, spacing, typography, and color usage. See the design tokens table in PLAN.md for exact values. When in doubt, the mockup wins over any written description.