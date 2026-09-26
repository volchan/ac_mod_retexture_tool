import { computed, ref } from 'vue'
import type { SkinEntry, SkinMeta } from '@/types/index'

const meta = ref<SkinMeta | null>(null)
const openedFolderName = ref('')
const exportFull = ref(true)
/// Zipping a skin takes long enough to look like nothing happened, so the button
/// reports it rather than letting an impatient second click start a second export.
const isExporting = ref(false)

export function useSkinMeta() {
  /** Seeds the form from the skin the workspace just opened. */
  function load(skin: SkinEntry): void {
    openedFolderName.value = skin.name
    meta.value = {
      folderName: skin.name,
      skinName: skin.displayName ?? '',
      driverName: skin.driverName ?? '',
      team: skin.team ?? '',
      number: skin.number ?? '',
      country: skin.country ?? '',
    }
  }

  /** Renumbers the folder to match, keeping whatever the author called the skin.
   *
   * Only ever called from a change the author makes, never from `load`: a skin
   * opened from disk must not rename itself into a fork just by being looked at.
   */
  function syncFolderToNumber(raceNumber: string): void {
    if (!meta.value) return
    meta.value.folderName = numbered(meta.value.folderName, raceNumber)
  }

  function reset(): void {
    meta.value = null
    openedFolderName.value = ''
    exportFull.value = true
  }

  /** A renamed folder forks a new skin instead of updating the opened one. */
  const isFork = computed(
    () => meta.value != null && meta.value.folderName !== openedFolderName.value,
  )

  const folderNameError = computed(() => validateFolderName(meta.value?.folderName ?? ''))

  /** A partial export of a renamed skin ships a folder the recipient does not
   * already have, so the files it leaves out are simply missing. */
  const incompleteFork = computed(() => isFork.value && !exportFull.value)

  return {
    meta,
    openedFolderName,
    exportFull,
    isExporting,
    isFork,
    incompleteFork,
    folderNameError,
    load,
    reset,
    syncFolderToNumber,
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// A folder already carrying a race number wears it as its last segment — the
/// way a grid is laid out on disk: `nismo_88`, `JRM_230`, `0_Nissan_12`, where
/// whatever comes first is the team or the skin's own index and the number the
/// driver chose closes the name. That suffix is swapped rather than stacked
/// when the number changes. It has to start with a digit: `racing_blue` ends
/// in a colour, not in car number blue.
const TRAILING_NUMBER = /(^|_)\d[A-Za-z0-9]*$/

/// Anything the folder name may not hold, collapsed so a number typed with a
/// space or a hash still produces a name AC can read.
const UNUSABLE_IN_FOLDER = /[^A-Za-z0-9]+/g

/** `24` over `racing_blue` gives `racing_blue_24`; over `racing_blue_51` it
 * replaces the 51 rather than stacking another suffix. An empty number strips
 * the suffix back off. */
function numbered(folderName: string, raceNumber: string): string {
  const base = folderName.replace(TRAILING_NUMBER, '')
  const suffix = raceNumber.trim().replace(UNUSABLE_IN_FOLDER, '')

  if (!suffix) return base
  return base ? `${base}_${suffix}` : suffix
}

const FOLDER_NAME_PATTERN = /^[A-Za-z0-9._-]+$/
/** Both pass the character test yet name a directory instead of a new skin. */
const RESERVED_FOLDER_NAMES = ['.', '..']

/** AC reads the folder name straight into race.ini, so keep it path-safe. */
function validateFolderName(name: string): string | null {
  if (name.trim() === '') return 'Skin name is required.'
  if (!FOLDER_NAME_PATTERN.test(name)) {
    return 'Use letters, digits, dots, dashes and underscores only.'
  }
  if (RESERVED_FOLDER_NAMES.includes(name)) return 'Choose a name, not a folder shortcut.'
  return null
}
