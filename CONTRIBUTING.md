# Contributing

## Prerequisites

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | 1.3.11 |
| [Rust](https://rustup.rs) | stable |
| [go-task](https://taskfile.dev) | latest |
| Tauri v2 [system deps](https://v2.tauri.app/start/prerequisites/) | see link |

On Linux, install the additional system libraries:
```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Setup

```bash
git clone https://github.com/volchan/ac_mod_retexture_tool.git
cd ac_mod_retexture_tool
bun install
task dev
```

## Workflow

1. Create a branch from `main`
2. Make your changes
3. Run `task check` (must pass before opening a PR)
4. Open a pull request against `main`

CI will run automatically on your PR (type-check, lint, tests).

## Task commands

```bash
task dev            # Dev server with hot reload
task test           # Run all tests
task lint           # Biome + Clippy
task format         # Auto-fix formatting
task check          # format + lint + test (run before pushing)
task test:coverage  # Generate coverage reports
```

## Code rules

### Both layers
- No magic strings or numbers. Extract constants.
- Names must explain intent. Comments only for *why*, never *what*.
- Files over ~150 lines should be split.

### Frontend (Vue / TypeScript)
- Vue 3 Composition API with `<script setup lang="ts">` only.
- Shared state in composables (`use*.ts`), never prop-drilled more than 2 levels.
- Components never call `invoke()` directly. Use typed wrappers in `src/lib/tauri.ts`.
- All types in `src/types/index.ts`.
- Tailwind only. No inline `style=`, no CSS files beyond `globals.css`.
- Biome enforces formatting and linting. Do not add `biome-ignore` comments or disable rules.
- Import directly from source files, not barrel `index.ts`.
- Imports used only in `<template>` must be listed in `defineExpose({})` (Biome cannot see template usage).

### Backend (Rust)
- Tauri commands go in `src-tauri/src/commands/`, one file per domain.
- Binary parsing goes in `parsers/`, image conversion in `converters/`, data structures in `models/`.
- Use `thiserror` for error types. No bare `String` errors in library code.
- No `unwrap()` in production paths. Use `?` and proper error propagation.
- `cargo clippy -- -D warnings` must pass with zero warnings.

## Testing

- 100% coverage is the target for composables, utils, and Rust commands/parsers.
- Frontend tests use Vitest + `@vue/test-utils`. Mock Tauri IPC via `src/__mocks__/tauri-api.ts`.
- Rust tests are `#[cfg(test)]` modules in each file.
- Test behaviour (what the code does), not implementation details (how it does it).

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
feat: add kn5 binary parser
fix: resolve texture decode error on malformed DDS
refactor: extract scan logic into module
test: add coverage for import matching edge cases
ci: update GitHub Actions runner version
```

Do not mention AI tools, assistants, or co-authors in commit messages.

## Pull requests

- Keep PRs focused. One feature or fix per PR.
- The PR description should explain *why* the change is needed, not just what changed.
- All CI checks must be green before merging.
- Request a review from a maintainer.
