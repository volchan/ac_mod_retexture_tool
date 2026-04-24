# Feature Spec: Assetto Corsa Library Auto-Detection

**Audience:** implementation agent (developer working in the real codebase, not the HTML mockup)
**Status:** ready to implement
**Related mockup:** `AC Mod Toolkit Redesign.html` → Library panel

---

## 1. Goal

On launch, the app should find the user's Assetto Corsa installation automatically and show their installed cars and tracks, with zero configuration in the happy path. If it can't find the install, it falls back to a manual picker. The detected location is remembered between sessions.

**Platform note:** Assetto Corsa ships only on Windows. Auto-detection is a **Windows-only** feature. On macOS and Linux, skip detection entirely and show the manual picker directly (see §2.5).

---

## 2. User-facing behavior

### 2.1 First launch (Windows)

1. App starts. Splash or the Library panel is shown in a **"Looking for Assetto Corsa…"** state (animated progress, list of paths being probed, each resolving to ✅ found or ✗ not found).
2. **If an install is found** → the Library view appears with the install header (path, version, car/track counts) and the mod browser populated. The detected path is persisted to settings (see §4).
3. **If nothing is found** → the user lands on the **"AC not found"** screen with two actions:
   - "Browse for folder…" (manual picker)
   - "Try again" (re-run detection)
   Once the user picks a valid folder, persist it and move to the browser.

### 2.2 Subsequent launches (Windows)

1. App reads the cached install path from settings.
2. **Fast validation**: does the folder exist and still contain `content/cars` + `content/tracks`? (`stat`-level check, no scanning yet.)
3. **If valid** → go straight to the Library browser. **No probing animation.** The user should not see the detection screen on every launch — that's a first-run concern.
4. **If the cached path is invalid** (folder deleted, drive unmounted, user moved their Steam library) → automatically re-run detection. If a new install is found at a different valid path, silently update the cached path and show a one-time non-blocking banner: *"AC install moved from `<old path>` to `<new path>`."* If detection still fails, drop to the "not found" screen.

### 2.3 Opening a single mod (drag-drop / browse)

Auto-detection is about *library browsing*. If the user drags a single mod folder into the app, we don't need a full install — open the mod directly. This flow is unchanged by this feature and works on all platforms.

### 2.4 Rescan / change location (Windows)

The install header in the Library panel exposes two controls:
- **Rescan** — re-runs the full animated probe (same UI as first launch). Useful after the user installs AC for the first time, moves their Steam library, or adds a custom content folder.
- **Change location** (settings/gear icon) — opens a native folder picker. The chosen folder is validated (§3.3) and persisted.

### 2.5 Non-Windows platforms (macOS, Linux)

AC is Windows-only, so the auto-detection pipeline is skipped entirely on other platforms:

1. No probing, no "Looking for AC…" screen, no scan of common paths.
2. The Library panel opens directly in the **"AC not found"** state, relabeled as **"Point to your AC folder"** (not an error, just a prompt). Copy suggestion: *"Assetto Corsa is a Windows game. If you're browsing a synced install, a Wine/Proton prefix, or a shared folder, pick that location here."*
3. The manual picker (§3.3 validation) runs as on Windows.
4. Once a path is picked, it's cached and used on subsequent launches exactly like the Windows cached-path flow (§2.2).
5. Rescan is **not** shown on non-Windows — there's nothing to rescan. Only "Change location" is available in the install header.

Detect the platform once at app start via the runtime's OS API (`process.platform === 'win32'` on Node/Electron, `cfg!(target_os = "windows")` on Rust/Tauri, etc.). Do not probe Windows paths on non-Windows even if they happen to be mounted.

---

## 3. Detection logic (Windows only)

### 3.1 Candidate paths (probe in order)

1. `%ProgramFiles(x86)%\Steam\steamapps\common\assettocorsa`
2. `%ProgramFiles%\Steam\steamapps\common\assettocorsa`
3. Steam install path from registry: `HKEY_CURRENT_USER\Software\Valve\Steam\SteamPath` (or `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) — append `steamapps\common\assettocorsa`.
4. Parse Steam's `libraryfolders.vdf` (at `<Steam>\steamapps\libraryfolders.vdf`) for all Steam library roots; append `steamapps\common\assettocorsa` to each. **Prefer this over a drive-letter scan** if Steam is installed.
5. Fallback heuristic only if the VDF is missing or unparseable: for every drive letter C:–Z: try `<drive>:\SteamLibrary\steamapps\common\assettocorsa`.
6. AC also supports a standalone (non-Steam) install — check the registry key `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Kunos Simulazioni\Assetto Corsa\InstallPath` if present.

**Override:** `%ACTOOLKIT_AC_PATH%` env var, if set and valid, wins over everything. Skip probing when present.

### 3.2 Probe implementation notes

- Probes should be parallel, not sequential — a serial walk over 26 drive letters is slow. Race them with a bounded concurrency (e.g. 8 at a time) and collect results.
- The **UI animation** can be decoupled from the actual probe timing. The probe is fast (milliseconds); the animation should have a minimum visible duration per path (~300–500 ms) so it doesn't flash. Show the *first valid* match as the winner; don't wait for every probe to finish before resolving.
- Log a full trace of probed paths + outcomes to the app log (useful for support when detection misbehaves).

### 3.3 Validation (all platforms — runs when the user picks manually)

A path counts as a valid AC install if **all** are true:
- The folder exists and is readable.
- `content/cars/` exists and is a directory.
- `content/tracks/` exists and is a directory.
- `acs.exe` exists in the folder root **OR** `appmanifest_244210.acf` exists in the parent `steamapps/` folder. (Guards against the user picking a random folder that happens to have `content/cars` inside it.)

On non-Windows the `acs.exe` check is still valid — users typically pick a mounted Windows install or a Proton/Wine prefix, both of which contain `acs.exe`.

If a folder fails validation, show a specific error: *"This folder doesn't look like an Assetto Corsa install. Missing: `<the missing thing>`."*

### 3.4 Multiple installs

If more than one valid install is found (rare — e.g. Steam + a standalone copy), show a picker inline in the detection UI: *"We found 2 installs. Which one should we use?"* with each option's path and a "use this one" button. Persist the chosen one.

---

## 4. Persistence

Store detection state in the app's settings file (e.g. `%APPDATA%\ac-toolkit\settings.json` on Windows, platform-appropriate equivalent elsewhere).

```json
{
  "acInstall": {
    "path": "D:\\SteamLibrary\\steamapps\\common\\assettocorsa",
    "detectedAt": "2026-04-24T10:15:00Z",
    "source": "auto" | "manual" | "env",
    "version": "1.16.4"
  }
}
```

- `path` — absolute, normalized (no trailing slash, OS-native separators).
- `source` — how we got this path. `auto` only ever set on Windows. `manual` set on any platform. Used for telemetry and to decide whether to re-probe (an `env`-sourced path is re-read from env every launch; `manual` is sticky).
- `version` — read from `content/system/build.ini` or the Steam manifest if possible. Displayed in the install header. Optional.

When the user picks manually or re-scans and the winner changes, overwrite this block.

---

## 5. Mod listing (what fills the browser after detection)

Not the core of this feature, but the detection hands off to a library scan. Rough contract:

1. Enumerate `content/cars/*` (each subfolder is a car) and `content/tracks/*` (each subfolder is a track).
2. For each entry, read light metadata:
   - **Cars:** `ui/ui_car.json` → `name`, `brand`, `year`, `specs.bhp`, `specs.weight`; count `skins/*` subfolders.
   - **Tracks:** `ui/ui_track.json` (or per-layout `ui/<layout>/ui_track.json`) → `name`, `country`, `length`, `pitboxes`, layout list.
   - Count texture-bearing files (`.dds`, `.png`, `.jpg`) for a rough texture count.
3. Classify each as **Kunos** (folder name starts with `ks_` or the install's manifest attributes it to Kunos) vs **Mod**.
4. Cache the scan result keyed by `(path, mtime of content/cars + content/tracks)` so re-opening the app is instant unless something changed.

The scan should run after detection completes, with a progress indicator in the header (*"Scanning 234 cars, 48 tracks…"*) that doesn't block the rest of the UI.

---

## 6. Edge cases

- **Network drive / slow disk.** Detection should time out any single probe at ~2s. Overall detection should time out at ~8s and fall through to the "not found" state with a *"Detection took too long — pick your install manually"* message.
- **Permission denied.** Treat as "not found" but log the reason.
- **Symlinks / junctions.** Resolve before validating, but store the original path. Don't follow recursive symlinks.
- **Path with unicode / spaces.** Must be handled correctly. Test with a path containing a space and a non-ASCII character.
- **Install deleted while app is running.** Not in scope — handle on next launch via §2.2 invalidation.
- **Steam not installed on Windows.** Skip the VDF and Steam registry probes gracefully; fall through to the drive-letter heuristic and standalone-install registry key.

---

## 7. UI states reference

The HTML mockup at `AC Mod Toolkit Redesign.html` → Library panel implements the states below. Match these visually:

| State | When |
|---|---|
| `detecting` | Windows first run, rescan, or cached-path invalidation |
| `detected` | Happy path — show browser |
| `not_found` | Windows: no install found, or user chose manual. Non-Windows: default entry point (relabeled as "Point to your AC folder", not an error) |
| `cached` (implied) | Windows & non-Windows subsequent launches with valid cached path; skip straight to `detected` UI with no animation |

---

## 8. Out of scope

- Downloading/installing AC itself.
- Managing multiple installs simultaneously (user can only have one active at a time).
- Content Manager compatibility (custom mod repos, CSP detection) — separate feature.
- Watching `content/cars` and `content/tracks` for live changes — re-scan happens on explicit user action or app restart.
- Auto-detecting Wine/Proton prefixes on Linux/macOS. Users can point at them manually via the picker.

---

## 9. Acceptance criteria

- [ ] **Windows:** first launch with AC installed via Steam → install detected and browser populated with zero user input.
- [ ] **Windows:** first launch without AC → clean "not found" screen with working manual picker.
- [ ] **Windows:** second launch → browser shows instantly (no animation, no re-probe).
- [ ] **Windows:** moving the AC folder between launches → automatic re-detection and banner; no broken state.
- [ ] **Windows:** Rescan button re-runs the animated probe and updates the cached path on a new winner.
- [ ] **Windows:** Steam `libraryfolders.vdf` parsing works; AC on a non-default drive is found without falling through to the drive-letter heuristic.
- [ ] **macOS / Linux:** first launch opens the manual picker directly, no probing animation, no Rescan button.
- [ ] **macOS / Linux:** second launch with a cached manual path → browser shows instantly.
- [ ] Manual picker validates the chosen folder and rejects non-AC folders with a specific error. Works identically across platforms.
- [ ] `%ACTOOLKIT_AC_PATH%` override works on Windows and is respected over any cached or auto-detected path.
- [ ] Detection completes or times out within 8s on Windows; no hangs on unresponsive drives.
