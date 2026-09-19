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

/// A folder already carrying a race number wears it as a leading `24_` or
/// `51A_`, or is the bare number itself. That prefix is swapped rather than
/// stacked when the number changes. It has to start with a digit: `rosso_corsa`
/// names a colour, not car number rosso.
const LEADING_NUMBER = /^\d[A-Za-z0-9]*(_(?=.)|$)/

/// Anything the folder name may not hold, collapsed so a number typed with a
/// space or a hash still produces a name AC can read.
const UNUSABLE_IN_FOLDER = /[^A-Za-z0-9]+/g

/** `24` over `rosso_corsa` gives `24_rosso_corsa`; over `51_rosso_corsa` it
 * replaces the 51 rather than stacking another prefix. An empty number strips
 * the prefix back off. */
function numbered(folderName: string, raceNumber: string): string {
  const base = folderName.replace(LEADING_NUMBER, '')
  const prefix = raceNumber.trim().replace(UNUSABLE_IN_FOLDER, '')

  if (!prefix) return base
  return base ? `${prefix}_${base}` : prefix
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
