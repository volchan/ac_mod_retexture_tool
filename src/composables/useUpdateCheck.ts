import { onMounted, ref } from 'vue'
import { getAppVersion } from '@/lib/tauri'

const RELEASES_URL = 'https://api.github.com/repos/volchan/ac_mod_retexture_tool/releases/latest'

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  win: ['.exe', '.msi'],
  mac: ['.dmg'],
  linux: ['.AppImage', '.deb', '.rpm'],
}

function getPlatformExtensions(): string[] {
  const p = navigator.platform.toLowerCase()
  if (p.includes('win')) return PLATFORM_EXTENSIONS.win
  if (p.includes('mac')) return PLATFORM_EXTENSIONS.mac
  return PLATFORM_EXTENSIONS.linux
}

function hasPlatformAsset(assets: { name: string }[]): boolean {
  const exts = getPlatformExtensions().map((ext) => ext.toLowerCase())
  return assets.some((a) => {
    const name = a.name.toLowerCase()
    return exts.some((ext) => name.endsWith(ext))
  })
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [latestParts, currentParts] = [parse(latest), parse(current)]
  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] ?? 0
    const c = currentParts[i] ?? 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

export function useUpdateCheck() {
  const updateAvailable = ref(false)
  const latestVersion = ref('')
  const currentVersion = ref('')

  onMounted(async () => {
    const current = await getAppVersion()
    currentVersion.value = current

    try {
      const response = await fetch(RELEASES_URL)
      if (!response.ok) return
      const data = await response.json()
      const latest = (data.tag_name as string).replace(/^v/, '')
      const assets = (data.assets ?? []) as { name: string }[]
      if (isNewer(latest, current) && hasPlatformAsset(assets)) {
        latestVersion.value = latest
        updateAvailable.value = true
      }
    } catch {
      // silent — no network or no release yet
    }
  })

  return { updateAvailable, latestVersion, currentVersion }
}
