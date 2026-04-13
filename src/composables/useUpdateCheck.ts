import { onMounted, ref } from 'vue'
import { getAppVersion } from '@/lib/tauri'

const RELEASES_URL = 'https://api.github.com/repos/volchan/ac_mod_retexture_tool/releases/latest'

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

  onMounted(async () => {
    try {
      const [current, response] = await Promise.all([getAppVersion(), fetch(RELEASES_URL)])
      if (!response.ok) return
      const data = await response.json()
      const latest = (data.tag_name as string).replace(/^v/, '')
      if (isNewer(latest, current)) {
        latestVersion.value = latest
        updateAvailable.value = true
      }
    } catch {
      // silent — no network or no release yet
    }
  })

  return { updateAvailable, latestVersion }
}
