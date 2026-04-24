# PLAN.md — AC Mod Toolkit Build Plan

Work through tasks in order. Each task ends with: lint → test → commit → (optionally) tell user to `task dev`.

## Design reference

Six mockup images are provided alongside this plan. The agent must match these designs exactly. They define every spacing, color, typography, and layout decision.

| Mockup | File | Shows |
|--------|------|-------|
| 01 | `mockup_01_empty_state.png` | App launch: 3-panel layout with drop zone in left panel, empty center with icon + "Drop a mod folder to preview textures", empty right panel with icon + "Load a mod to edit its info". Header has app name + theme toggle. Status bar says "No mod loaded". |
| 02 | `mockup_02_car_mod_loaded.png` | Car mod loaded: left panel shows Car badge + file tree (collapsible). Center has category tabs (All / Body / Liveries / Interior / Wheels / Other), decode progress bar (75%), 4-column texture grid with checkerboard transparency bg, selected cards have blue border + checkmark, unselected are default border, still-decoding cards show spinner. Import drop zone at bottom of grid. Right panel shows General form (name, folder name, author, version, description) + Car details section (brand, BHP, weight). Repack button at bottom. Status bar shows mod name + texture count + selected count. |
| 03 | `mockup_03_track_mod_hero_images.png` | Track mod loaded: left panel shows green Track badge + file tree with multiple KN5 files. Center has track-specific tabs (All / Road / Terrain / Buildings / Props / Sky). Above the texture grid, a "Key images" section with two cards: loading screen (16:9 aspect, preview.png) and track outline (wider aspect, outline.png). Each card has Extract PNG + Replace buttons. Outline shows amber "Replaced" badge + revert button. Right panel shows Track details section (country, length, pit boxes) instead of car fields. Replacements summary shows count. |
| 04 | `mockup_04_extract_dialog.png` | Modal dialog: title "Extract 5 textures", folder picker showing selected path + Browse button, output structure preview in monospace showing mod_name/kn5_name/texture.png tree, progress bar at 60% with "Extracting..." label, Cancel + Extract buttons. |
| 05 | `mockup_05_import_confirmation.png` | Modal dialog: title "Replace 4 textures?", amber warning for size mismatch, matched list with thumbnail preview + texture name + source + dimension comparison (arrow between old → new, amber highlight when different), skipped files section, Cancel + "Apply 4 replacements" button. |
| 06 | `mockup_06_repack_dialog.png` | Modal dialog: title "Repack mod", description mentioning only changed textures recompiled, save path display in mono, mod info summary (name, folder, author, texture counts), progress bar at 65% with step label "Recompiling textures in ferrari_488.kn5...", step indicators showing completed (checkmark), active (spinner), pending (empty circle) for: Copy files → Metadata → Textures → Archive. |

### Design tokens to match

- **Panel backgrounds**: left and right panels use muted/secondary bg. Center panel is default bg.
- **Panel headers**: uppercase, 11px, secondary text color, 0.5px letter-spacing.
- **Mod type badges**: Car = blue pill (blue-50 bg, blue-800 text). Track = green/teal pill (teal-50 bg, teal-800 text).
- **Texture cards**: border-radius-md, 0.5px default border. Selected = 2px blue border + blue checkmark top-left. Replaced = amber border + amber "Replaced" badge top-right with refresh icon. Checkerboard bg for transparency. Footer shows name (11px medium) + dimensions + format (10px secondary).
- **Progress bars**: 4px height in toolbars, 6px in dialogs. Info color fill. Label left + percentage right above the bar.
- **Form fields**: 11px labels in secondary color, inputs with 0.5px border, border-radius-md, 6px 8px padding, 12px font size.
- **Buttons**: primary = text-primary bg + background-primary text. Outline = 0.5px border-secondary. Ghost = no border. Disabled = 50% opacity.
- **Dialogs**: border-radius-lg, 20px padding, title 16px/500, description 13px secondary. Footer buttons right-aligned with 8px gap.
- **Drop zones**: 2px dashed border, border-radius-lg, centered icon in circle + text. Drag-over state = primary color border + primary/10 bg.
- **Status bar**: 6px 16px padding, 11px text, secondary color, justified space-between.
- **Import drop zone** (bottom of texture grid): same dashed style but horizontal layout with icon circle + title + subtitle.

---

## 01 · Scaffold project

1. Initialize Tauri v2 project with Vue + TypeScript using `bun create tauri-app` — pick Vue, TypeScript.
2. Verify bun version is 1.3.11 (`bun --version`).
3. Install Biome: `bun add -d @biomejs/biome`. Create `biome.json`:
   - formatter: indent with 2 spaces, line width 100, trailing commas all
   - linter: all recommended rules on, enforce `noExplicitAny`
   - organize imports enabled
   - override for `.vue` files to use the Vue parser
4. Install Taskfile runner if not present. Create `Taskfile.yml` (see below).
5. Remove any ESLint/Prettier config or deps the scaffold created.
6. Install core frontend deps: `vue-router`, `@vueuse/core`, `lucide-vue-next`.
7. Install dev deps: `vitest`, `@vue/test-utils`, `@vitest/coverage-v8`, `jsdom`.
8. Set up `vitest.config.ts` with Vue plugin, jsdom environment, coverage thresholds at 100.
9. Set up `src/assets/styles/globals.css` with Tailwind directives.
10. Set up Tailwind: `bun add -d tailwindcss @tailwindcss/vite`.
11. Add shadcn-vue: `bunx shadcn-vue@latest init` — pick default style, slate, CSS variables yes.
12. Verify the app runs with `task dev` — you should see the default Tauri window.
13. Clean up scaffold boilerplate: remove default component content, add a centered "AC Mod Toolkit" placeholder text.
14. Create the directory structure:

```
src/
├── assets/styles/globals.css
├── components/
│   ├── ui/              (shadcn — added via CLI)
│   ├── layout/
│   ├── mod/
│   ├── texture/
│   ├── repack/
│   └── theme/
├── composables/
├── lib/
│   ├── utils.ts         (shadcn cn helper)
│   └── tauri.ts         (typed invoke wrappers)
├── types/
│   └── index.ts
├── App.vue
└── main.ts

src-tauri/src/
├── commands/
│   └── mod.rs
├── parsers/
│   └── mod.rs
├── converters/
│   └── mod.rs
├── models/
│   └── mod.rs
├── errors.rs
├── lib.rs
└── main.rs
```

15. Commit: `scaffold tauri project with vue and biome`

---

## 02 · Taskfile

Create `Taskfile.yml` with these tasks:

| Task | Command |
|------|---------|
| `dev` | `bun run tauri dev` |
| `build` | `bun run tauri build` |
| `lint` | `bunx biome check .` then `cd src-tauri && cargo clippy -- -D warnings` |
| `format` | `bunx biome check --write .` then `cd src-tauri && cargo fmt` |
| `test` | `bunx vitest run` then `cd src-tauri && cargo test` |
| `test:watch` | `bunx vitest` |
| `test:coverage` | `bunx vitest run --coverage` then `cd src-tauri && cargo tarpaulin` |
| `ui:add` | `bunx shadcn-vue@latest add {{.CLI_ARGS}}` |

Commit: `add taskfile`

---

## 03 · Rust error handling foundation

1. Create `src-tauri/src/errors.rs`:
   - Define `AppError` enum with `thiserror` for: `Io`, `ImageDecode`, `ImageEncode`, `Kn5Parse`, `AcdDecrypt`, `Serialize`, `NotFound(String)`.
   - Implement `Into<String>` for Tauri command returns.
2. Create empty `mod.rs` files in `commands/`, `parsers/`, `converters/`, `models/` that will re-export as modules grow.
3. Wire up `lib.rs` to declare all modules.
4. Write tests for error display/conversion.
5. Commit: `add rust error types`

---

## 04 · Types and models

1. Frontend: create `src/types/index.ts` with all shared types:
   - `ModType`, `Mod`, `ModMeta`, `ModFile`, `SkinFolder`
   - `Texture`, `TextureCategory`, `TextureSource`
   - `ProgressInfo`, `RepackOptions`
   - `MatchedTexture`, `UnmatchedFile`
2. Rust: create `src-tauri/src/models/`:
   - `mod_info.rs` — `ModType`, `ModManifest`, `ModMeta`, `ModFileEntry`
   - `texture.rs` — `TextureEntry`, `TextureSource`, `TextureCategory`
   - `repack.rs` — `RepackOptions`, `TextureReplacement`
   - All with `Serialize`/`Deserialize`.
3. Write tests verifying serialization round-trips.
4. Commit: `add shared types and models`

---

## 05 · Theme system

1. Create `src/composables/useTheme.ts`:
   - Supports `light`, `dark`, `system` modes.
   - Persists to Tauri store plugin (`@tauri-apps/plugin-store`).
   - Listens to OS preference changes in `system` mode.
   - Toggles `.dark` class on `<html>`.
2. Install Tauri store plugin: add `tauri-plugin-store` to Cargo.toml, register in `lib.rs`.
3. Create `src/components/theme/ThemeToggle.vue` — cycles through modes with an icon.
4. Add shadcn components needed: `bunx shadcn-vue@latest add button dropdown-menu`.
5. Write tests: theme cycling, persistence mock, class toggling.
6. Commit: `add dark/light theme with persistence`
7. Tell user to `task dev` — they should see the theme toggle working.

---

## 06 · Layout shell

1. Create `src/components/layout/AppHeader.vue` — app name + theme toggle.
2. Create `src/components/layout/StatusBar.vue` — bottom bar showing mod info summary.
3. Create `src/components/layout/WorkspaceLayout.vue` — 3-panel layout:
   - Left (280px): mod source panel
   - Center (flex): texture browser
   - Right (320px): mod info form
   - All panels are empty slots/placeholders for now.
4. Wire `App.vue` → `WorkspaceLayout`.
5. Add shadcn: `scroll-area`, `tabs`, `separator`.
6. Write tests: layout renders three panels, header shows toggle.
7. Commit: `add 3-panel workspace layout`
8. Tell user to `task dev`.

---

## 07 · Mod drop zone and folder scanning (frontend)

1. Create `src/components/mod/ModDropZone.vue`:
   - Listens to Tauri window drag-drop events.
   - Also supports click-to-browse via `@tauri-apps/plugin-dialog`.
   - Emits `drop` event with the folder path.
   - Shows visual feedback on drag-over.
2. Create `src/lib/tauri.ts` — typed wrappers:
   - `scanModFolder(path: string): Promise<Mod>`
   - (Add more wrappers in later tasks.)
3. Create `src/composables/useMod.ts`:
   - Manages mod loading state, calls `scanModFolder`.
   - Exposes `mod`, `isLoading`, `loadMod`, `closeMod`.
4. Wire `ModDropZone` into the left panel of `WorkspaceLayout`.
5. Install Tauri dialog plugin: add `tauri-plugin-dialog` to Cargo.toml, register.
6. Write tests: drop event handling, composable state transitions.
7. Commit: `add mod drop zone and folder scanning composable`
8. Tell user to `task dev`.

---

## 08 · Mod folder scanner (Rust)

1. Install Rust deps: `walkdir`, `serde_json`.
2. Create `src-tauri/src/commands/scan.rs`:
   - `scan_mod_folder(path: String) -> Result<ModManifest, String>`
   - Detects mod type (car/track) from folder structure.
   - Finds all KN5 files, ACD archive, skin folders, JSON metadata.
   - Parses `ui_car.json` / `ui_track.json` for metadata.
   - Returns a `ModManifest` with everything the frontend needs.
3. Register command in `lib.rs`.
4. Write tests with fixture directories (create minimal test fixtures in `src-tauri/tests/fixtures/`).
5. Commit: `add mod folder scanner`

---

## 09 · File tree display

1. Create `src/components/mod/ModTree.vue`:
   - Renders the mod's file list as an indented tree.
   - Icons by file type (KN5, DDS, JSON, folder).
   - Collapsible folders.
2. Wire into left panel — show tree when mod is loaded, drop zone when not.
3. Add the mod type badge (Car/Track) above the tree.
4. Add a "Close" button to unload the mod.
5. Write tests: tree renders files, folders collapse, close works.
6. Commit: `add mod file tree display`
7. Tell user to `task dev`.

---

## 10 · KN5 binary parser (Rust)

1. Install: `binrw`, `image`, `image-dds`, `base64`.
2. Create `src-tauri/src/parsers/kn5.rs`:
   - `Kn5File` struct with methods: `open(path)`, `texture_names()`, `get_texture_data(name)`, `replace_texture_data(name, data)`, `save(path)`.
   - Parse the KN5 header, texture table, and embedded DDS blobs using `binrw`.
   - Store byte offsets so unchanged sections can be copied without re-encoding.
3. Write thorough tests with a real minimal KN5 test fixture.
4. Commit: `add kn5 binary parser`

---

## 11 · DDS converter (Rust)

1. Create `src-tauri/src/converters/dds.rs`:
   - `decode_to_rgba(data: &[u8]) -> Result<DynamicImage>` — DDS → image.
   - `encode_from_image(img: &DynamicImage, format: &str) -> Result<Vec<u8>>` — image → DDS.
   - `generate_thumbnail(data: &[u8], max_size: u32) -> Result<String>` — returns base64 PNG data URL.
   - Support DXT1/BC1, DXT3/BC2, DXT5/BC3, BC7, BC4, BC5.
2. Write tests for each format round-trip (decode then encode).
3. Commit: `add dds texture converter`

---

## 12 · Texture decoding command (Rust)

1. Create `src-tauri/src/commands/decode.rs`:
   - `decode_mod_textures(mod_path: String) -> Result<Vec<TextureEntry>>`
   - Walks all KN5 files + skin folders in the mod.
   - For each texture: decodes a thumbnail preview, detects category (body/livery/road/terrain/etc based on filename patterns), reads dimensions.
   - Emits `decode-progress` events via `app.emit()`.
   - Returns the full texture list with base64 preview URLs.
2. Auto-categorization logic lives in `models/texture.rs` as a pure function `categorize(filename: &str, mod_type: ModType) -> TextureCategory`.
3. Tests: progress emission, categorization accuracy, thumbnail generation.
4. Commit: `add texture decoding with progress`

---

## 13 · Texture browser (frontend)

1. Create `src/composables/useTextures.ts`:
   - Calls `decodeModTextures` when mod loads.
   - Manages: `textures`, `selected` (Set), `decodeProgress`, `isDecoding`.
   - Methods: `toggleSelect`, `selectAll`, `deselectAll`.
2. Create `src/components/texture/TextureCard.vue`:
   - Thumbnail with checkerboard background for transparency.
   - Selection checkmark on click.
   - Spinner while decoding.
   - Shows name, dimensions, DDS format.
3. Create `src/components/texture/TexturePanel.vue`:
   - Toolbar with category tabs (context-aware: car vs track categories).
   - Select all / deselect all.
   - Decode progress bar.
   - Responsive grid of `TextureCard`.
   - Result count.
4. Wire into center panel of `WorkspaceLayout`.
5. Tests: selection logic, filtering by category, progress display.
6. Commit: `add texture browser with categories and selection`
7. Tell user to `task dev`.

---

## 14 · Track hero images

1. Create Rust command in `commands/track_hero.rs`:
   - `get_track_hero_image(mod_path, filename)` — returns preview + dimensions.
   - `extract_track_hero_image(mod_path, filename, output_path)` — saves PNG.
   - `preview_replacement_image(image_path)` — thumbnail for replacement.
2. Create `src/components/texture/TrackHeroImages.vue`:
   - Shows `preview.png` (loading screen, 16:9) and `outline.png` (track map, square).
   - Extract PNG button + Replace button + fullscreen preview.
   - "Replaced" badge + revert.
3. Wire into `TexturePanel` — shows above texture grid when mod type is track and tab is "All".
4. Add shadcn: `dialog`.
5. Tests: extract/replace flow, revert, preview display.
6. Commit: `add track loading screen and outline quick replace`
7. Tell user to `task dev`.

---

## 15 · Texture extraction

1. Create Rust command in `commands/extract.rs`:
   - `extract_textures(mod_path, texture_ids, output_dir)` — structured extraction.
   - Creates `<mod_name>/<kn5_name>/<texture>.png` structure.
   - Caches parsed KN5 files.
   - Emits `extract-progress`.
   - Returns error list for partial failures.
2. Create `src/components/texture/ExtractDialog.vue`:
   - Opens via "Extract (N)" button.
   - Folder picker via `@tauri-apps/plugin-dialog`.
   - Live output tree preview.
   - Progress bar.
   - Success/error summary.
3. Wire into `TexturePanel` toolbar.
4. Tests: structured output paths, progress emission, KN5 caching, error handling.
5. Commit: `add structured texture extraction with folder picker`
6. Tell user to `task dev`.

---

## 16 · Texture import

1. Create Rust command in `commands/import.rs`:
   - `scan_import_folder(mod_path, import_path)` — matches dropped folder against mod manifest.
   - Case-insensitive matching on filenames.
   - Smart root detection (skips wrapper folder).
   - Generates preview thumbnails for each match.
   - Emits `import-scan-progress`.
   - Returns `matched[]` + `unmatched[]`.
2. Create `src/components/texture/ImportPanel.vue`:
   - Drop zone at bottom of texture grid.
   - Also click-to-browse.
   - Scanning progress bar with current filename.
   - Confirmation dialog: matched list with thumbnails + dimension comparison, size mismatch warnings, skipped files list.
   - "Apply N replacements" button.
3. Update `TextureCard.vue`:
   - Show replacement preview when texture is replaced.
   - Amber border + "Replaced" badge.
   - Show new dimensions if they differ.
4. Update `useTextures.ts` to handle `applied` event: update texture entries with replacement info.
5. Tests: path matching logic, smart root detection, mismatch detection, card status display.
6. Commit: `add texture import with preview and matching`
7. Tell user to `task dev`.

---

## 17 · Mod info form

1. Create `src/components/repack/ModInfoPanel.vue`:
   - Auto-fills form from mod metadata on load.
   - General fields: display name, folder name, author, version, description.
   - Car-specific: brand, class, BHP, weight.
   - Track-specific: country, length, pitboxes.
   - Folder name change warning.
   - Reset button.
   - Replacement summary (N textures will be recompiled).
2. Add shadcn: `input`, `label`, `textarea`, `progress`, `toast`.
3. Wire into right panel of `WorkspaceLayout`.
4. Tests: auto-fill from mod, field visibility by mod type, reset, validation.
5. Commit: `add mod info editor form`
6. Tell user to `task dev`.

---

## 18 · Repack engine (Rust)

1. Install: `sevenz-rust`, `tempfile`.
2. Create `src-tauri/src/commands/repack.rs`:
   - `repack_mod(mod_path, output_path, mod_info, replacements)`:
     - Copies mod to temp dir with new folder name.
     - Updates JSON metadata.
     - For each KN5 with replacements: load, PNG→DDS (same format as original), patch, save.
     - Unchanged KN5 files are byte-copied — never opened.
     - Packs into .7z with correct root folder name.
     - Emits `repack-progress` with step descriptions.
3. Tests: metadata update, selective KN5 patching, 7z archive structure, unchanged files preserved.
4. Commit: `add repack engine with 7zip output`

---

## 19 · Repack flow (frontend)

1. Update `ModInfoPanel.vue`:
   - "Repack as .7z" button opens save dialog.
   - Confirmation dialog: output path, mod info summary, replacement count.
   - Progress bar with step descriptions.
   - Success / error state.
2. Create `src/composables/useRepack.ts`:
   - Calls `repackMod` with form values + replacement list.
   - Listens to `repack-progress` events.
   - Exposes `isRepacking`, `repackProgress`, `repackDone`, `repackError`.
3. Tests: repack flow states, progress tracking, error handling.
4. Commit: `add repack flow with progress and save dialog`
5. Tell user to `task dev`.

---

## 20 · ACD archive support (Rust)

1. Install: `aes`.
2. Create `src-tauri/src/parsers/acd.rs`:
   - `AcdArchive` struct: `open(path)`, `list_files()`, `read_file(name)`, `write_file(name, data)`, `save(path)`.
   - Handles the AES encryption AC uses for data.acd.
3. Wire ACD reading into the scan command — list contents, show in file tree.
4. Wire ACD writing into the repack command — re-encrypt if metadata changes affect data.acd contents.
5. Tests: decrypt/encrypt round-trip, file listing, content replacement.
6. Commit: `add acd archive encrypt and decrypt`

---

## 21 · Polish and edge cases

1. Handle mods with no `ui_car.json`/`ui_track.json` — show empty form, don't crash.
2. Handle mods with multiple KN5 files (common for tracks) — all appear in tree and texture grid.
3. Handle skin folders for car mods — textures show under Liveries category.
4. Large texture sets: add virtual scrolling with `@tanstack/vue-virtual` if texture count > 200.
5. Add keyboard shortcuts via VueUse `useMagicKeys`:
   - `Cmd/Ctrl+A` — select all textures.
   - `Cmd/Ctrl+D` — deselect all.
   - `Cmd/Ctrl+E` — open extract dialog.
   - `Escape` — close dialogs.
6. Add toast notifications (shadcn `toast`) for: extraction complete, import applied, repack done, errors.
7. Tests for all edge cases.
8. Commit: `add edge case handling and keyboard shortcuts`
9. Tell user to `task dev`.

---

## 22 · Final lint, test, build

1. Run `task format`.
2. Run `task lint` — fix everything.
3. Run `task test:coverage` — must be 100%.
4. Run `task build` — verify it produces binaries for the host platform.
5. Commit: `final lint and test pass`
6. Tell user: "The app is ready. Run `task build` to produce the distributable, or `task dev` to continue developing."