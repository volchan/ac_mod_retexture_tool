import { computed, ref } from 'vue'
import type { SkinEntry, SkinMeta } from '@/types/index'

const meta = ref<SkinMeta | null>(null)
const openedFolderName = ref('')

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

  function reset(): void {
    meta.value = null
    openedFolderName.value = ''
  }

  /** A renamed folder forks a new skin instead of updating the opened one. */
  const isFork = computed(
    () => meta.value != null && meta.value.folderName !== openedFolderName.value,
  )

  const folderNameError = computed(() => validateFolderName(meta.value?.folderName ?? ''))

  return { meta, openedFolderName, isFork, folderNameError, load, reset }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

const FOLDER_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

/** AC reads the folder name straight into race.ini, so keep it path-safe. */
function validateFolderName(name: string): string | null {
  if (name.trim() === '') return 'Skin name is required.'
  if (!FOLDER_NAME_PATTERN.test(name)) {
    return 'Use letters, digits, dots, dashes and underscores only.'
  }
  return null
}
