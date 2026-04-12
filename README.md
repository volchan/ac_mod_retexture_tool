# AC Mod Retexture Tool

A cross-platform desktop app for extracting, replacing, and repacking textures in Assetto Corsa mod files. Drop a mod folder, browse its textures, import your replacements, and get a ready-to-install ZIP.

Built with [Tauri v2](https://v2.tauri.app/) + [Vue 3](https://vuejs.org/) + Rust.

---

## Features

- **Drag & drop** a track mod folder to load it instantly
- **Browse textures** organized by origin file (KN5) with category filtering
- **Preview textures** with thumbnail rendering directly from binary DDS data
- **Extract** selected textures as PNG files
- **Import** replacement PNGs from a folder, with automatic name matching and dimension mismatch warnings
- **Repack** the mod as a compressed `.zip` with your replacements applied
- Supports single-layout and multi-layout tracks (multiple `ui/<layout>/` subdirs)
- Content Manager `preview.png` thumbnails shown in a dedicated group

> **Track mods only.** Car mod support is planned but not yet active.

---

## How It Works

### 1. Load a mod

Drop a mod folder onto the left panel. The app reads `ui_track.json` (or `ui/<layout>/ui_track.json`) to detect the mod type and extract metadata (name, author, country, track length, etc.).

### 2. Decode textures

All `.kn5` files in the mod folder are parsed in the background. Each embedded DDS texture is decoded and a 128px thumbnail is generated. Progress is shown in the texture panel.

`preview.png` files (Content Manager thumbnails) are also detected and grouped at the top.

### 3. Browse and select

Textures are displayed in a grid, grouped by their origin `.kn5` file, sorted alphabetically. Use the category tabs to filter by type (Road, Terrain, Sky, etc.). Click a texture to select it; use **Select all** / **Deselect all** for bulk operations.

### 4. Extract

Select textures and click **Extract**. Choose an output folder. Each texture is exported as a PNG, organised in subdirectories matching the KN5 origin (e.g. `track/track.kn5/road_surface.png`).

### 5. Import replacements

Drop a folder of PNG files into the import zone at the bottom of the texture panel. The folder structure must match the one produced by the Extract step exactly (subdirectories named after the KN5 file). The app matches PNGs by filename stem, shows a confirmation dialog with dimension warnings, and queues the replacements. Replaced textures show an amber badge.

### 6. Repack

Click **Repack as .zip** in the right panel. Choose an output path. The app produces a compressed ZIP that:

- Copies all original mod files unchanged
- Converts replacement PNGs back to the original DDS format
- Re-encodes replacement images into their original KN5 files
- Replaces `preview.png` files in place

The resulting `.zip` can be shared or installed directly via Content Manager.

---

## Architecture

```
src/                        Vue 3 frontend
  components/
    layout/                 AppHeader, WorkspaceLayout, StatusBar
    mod/                    ModDropZone, ModTree
    repack/                 ModInfoPanel, RepackDialog
    texture/                TexturePanel, TextureCard, CategoryTabs,
                            ExtractDialog, ImportConfirmDialog, ImportDropZone
    ui/                     shadcn-vue components, Spinner, Toaster
  composables/
    useMod.ts               Mod loading state
    useTextures.ts          Texture list, selection, replacements
    useRepack.ts            Repack progress
    useTheme.ts             Light/dark theme
  lib/
    tauri.ts                Typed wrappers for all Tauri IPC commands
    utils.ts                Shared helpers (previewLabel, cn, ...)
  types/index.ts            All shared TypeScript types

src-tauri/src/              Rust backend
  commands/
    scan.rs                 Detect mod type, parse ui_*.json metadata
    decode.rs               Parse KN5 files, emit texture events
    extract.rs              Export textures as PNG
    import.rs               Match import folder PNGs to texture list
    track_hero.rs           Replace preview.png files
    repack.rs               Build output ZIP with replacements applied
  parsers/
    kn5.rs                  KN5 binary format parser (binrw)
  converters/
    dds.rs                  DDS decode, thumbnail generation, format detection
  models/                   Shared data structures (Mod, Texture, ...)
```

### IPC flow

Frontend calls typed functions in `lib/tauri.ts` which call Tauri `invoke()` which dispatches to Rust commands. Long-running operations (decode, extract, repack) emit progress events over Tauri's event bus; the frontend listens with `listen()`.

---

## Development

### Prerequisites

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | 1.3.11 |
| [Rust](https://rustup.rs) | stable |
| [go-task](https://taskfile.dev) | latest |
| Tauri v2 [system deps](https://v2.tauri.app/start/prerequisites/) | see link |

On Linux you also need:
```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### Setup

```bash
git clone https://github.com/volchan/ac_mod_retexture_tool.git
cd ac_mod_retexture_tool
bun install
```

### Common tasks

```bash
task dev          # Start dev server with hot reload
task build        # Build production binaries
task test         # Run all tests (frontend + backend)
task lint         # Lint (Biome + Clippy)
task format       # Auto-fix formatting
task check        # format + lint + test
```

---

## License

MIT
