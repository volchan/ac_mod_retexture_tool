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

### Quick Start

```bash
# 1. Install prerequisites for your platform (see below)
# 2. Clone and setup
git clone https://github.com/volchan/ac_mod_retexture_tool.git
cd ac_mod_retexture_tool
bun install

# 3. Start development
task dev
```

---

### Platform-Specific Prerequisites

<details>
<summary><strong>🪟 Windows</strong></summary>

#### Option A: Native Windows

**Required:**
- **[Bun](https://bun.sh)** 1.3.11+
  ```powershell
  # PowerShell
  irm bun.sh/install.ps1|iex
  ```
- **[Rust](https://rustup.rs)** stable - Download and run `rustup-init.exe`
- **[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/downloads/)** - Install "Desktop development with C++" workload
- **[WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)** - Pre-installed on Windows 11; Windows 10 users install Evergreen Standalone Installer

**Optional but recommended:**
- **[go-task](https://taskfile.dev/installation/)** (or use `bun run` commands directly)
  - Via [Chocolatey](https://chocolatey.org/): `choco install go-task`
  - Via [Scoop](https://scoop.sh/): `scoop install task`
  - Via [winget](https://learn.microsoft.com/windows/package-manager/winget/): `winget install Task.Task`

**Enable long paths** (recommended, PowerShell as Admin):
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

**Notes:**
- First `task dev` run may trigger Windows Firewall - allow access
- Restart terminal after installing tools to refresh PATH

#### Option B: WSL (Windows Subsystem for Linux)

1. **Install WSL2** (PowerShell as Admin):
   ```powershell
   wsl --install
   ```
2. Restart and complete Ubuntu setup
3. Inside WSL, follow **Linux** instructions below

**Benefits:** Simpler tooling, Linux-like environment, smaller disk footprint

</details>

<details>
<summary><strong>🐧 Linux</strong></summary>

**Required:**
- **[Bun](https://bun.sh)** 1.3.11+
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **[Rust](https://rustup.rs)** stable
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **[go-task](https://taskfile.dev/installation/)**
  ```bash
  # Via snap
  sudo snap install task --classic
  
  # Or download binary from GitHub releases
  ```
- **System libraries:**
  ```bash
  # Debian/Ubuntu
  sudo apt-get update
  sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
  
  # Fedora
  sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel patchelf
  
  # Arch
  sudo pacman -S webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf
  ```

</details>

<details>
<summary><strong>🍎 macOS</strong></summary>

**Required:**
- **[Bun](https://bun.sh)** 1.3.11+
  ```bash
  # Via Homebrew
  brew install bun
  
  # Or direct install
  curl -fsSL https://bun.sh/install | bash
  ```
- **[Rust](https://rustup.rs)** stable
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **[go-task](https://taskfile.dev/installation/)**
  ```bash
  brew install go-task
  ```
- **Xcode Command Line Tools**
  ```bash
  xcode-select --install
  ```

**Requirements:** macOS 10.15+ for Tauri v2 support

</details>

---

### Common Tasks

```bash
task dev          # Start dev server with hot reload
task build        # Build production binaries
task test         # Run all tests (frontend + backend)
task lint         # Lint (Biome + Clippy)
task format       # Auto-fix formatting
task check        # format + lint + test
```

**Without go-task installed:**
```bash
bun run tauri dev           # = task dev
bun run tauri build         # = task build
bunx vitest run             # = task test:frontend
```

---

### Optional: Texture Upscaling Enhancement

Download `upscayl-bin` and AI models for texture upscaling feature:

**Linux/macOS:**
```bash
task setup:enhance
```

**Windows:**
```powershell
task setup:enhance:windows
```

---

### Troubleshooting

<details>
<summary><strong>Windows</strong></summary>

- **"command not found" after installing tools**
  → Restart terminal/IDE to refresh PATH
  
- **Rust linker errors during build**
  → Ensure Microsoft C++ Build Tools are installed with "Desktop development with C++" workload
  
- **File path too long errors**
  → Enable long paths (see Windows setup above)
  
- **PowerShell execution policy errors**
  → Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

</details>

<details>
<summary><strong>Linux</strong></summary>

- **Webkit/GTK errors during build**
  → Install system libraries (see Linux prerequisites)
  
- **Permission denied on binaries**
  → Run `chmod +x` on executable files if needed
  
- **Package not found on non-Debian systems**
  → Check your distro's package manager for equivalent packages

</details>

<details>
<summary><strong>macOS</strong></summary>

- **xcrun errors or missing compiler**
  → Install Xcode Command Line Tools: `xcode-select --install`
  
- **Bun permission issues**
  → May need to reload shell profile: `source ~/.zshrc` or `source ~/.bashrc`
  
- **"Developer cannot be verified" warning**
  → Go to System Preferences → Security & Privacy → Allow

</details>

<details>
<summary><strong>All Platforms</strong></summary>

- **Task command not found**
  → Use direct commands (e.g., `bun run tauri dev`) or install go-task
  
- **Rust compilation very slow on first build**
  → Normal behavior; subsequent builds are incremental and much faster
  
- **Port already in use (default 1420)**
  → Another app is using the port; kill it or change port in `vite.config.ts`

</details>

---

## License

MIT
