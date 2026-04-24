import { onMounted, ref } from 'vue'
import { getAppVersion } from '@/lib/tauri'

const REPO = 'volchan/ac_mod_retexture_tool'
const STABLE_URL = `https://api.github.com/repos/${REPO}/releases/latest`
const ALL_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`

const PLATFORM_EXTENSIONS: Record<string, string[]> = {
  win: ['.exe', '.msi'],
  mac: ['.dmg'],
  linux: ['.appimage', '.deb', '.rpm'],
}

type NavigatorWithUAData = Navigator & { userAgentData?: { platform: string } }

interface GithubRelease {
  tag_name: string
  prerelease: boolean
  assets: { name: string }[]
}

function getPlatformExtensions(): string[] {
  const nav = navigator as NavigatorWithUAData
  const p = (nav.userAgentData?.platform ?? navigator.platform).toLowerCase()
  if (p.includes('win')) return PLATFORM_EXTENSIONS.win
  if (p.includes('mac')) return PLATFORM_EXTENSIONS.mac
  return PLATFORM_EXTENSIONS.linux
}

function hasPlatformAsset(assets: { name: string }[]): boolean {
  const exts = getPlatformExtensions()
  return assets.some((a) => {
    const name = a.name.toLowerCase()
    return exts.some((ext) => name.endsWith(ext))
  })
}

interface SemVer {
  major: number
  minor: number
  patch: number
  pre: string
}

function parseSemver(v: string): SemVer {
  const match = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.?(\d+)?(?:-(.+))?$/)
  if (!match) return { major: 0, minor: 0, patch: 0, pre: '' }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3] ?? '0', 10),
    pre: match[4] ?? '',
  }
}

export function isBetaVersion(v: string): boolean {
  return /-(beta|alpha|rc|pre)([.\d]|$)/i.test(v)
}

const PRE_ORDER: Record<string, number> = { alpha: 0, beta: 1, pre: 2, rc: 3 }

function comparePre(a: string, b: string): number {
  if (a === b) return 0
  const re = /^([a-z]+)\.?(\d+)?$/i
  const ma = a.match(re)
  const mb = b.match(re)
  if (!ma || !mb) return a.localeCompare(b)
  const labelA = ma[1].toLowerCase()
  const labelB = mb[1].toLowerCase()
  if (labelA !== labelB) {
    const orderA = PRE_ORDER[labelA] ?? 99
    const orderB = PRE_ORDER[labelB] ?? 99
    return orderA - orderB
  }
  return (parseInt(ma[2] ?? '0', 10) || 0) - (parseInt(mb[2] ?? '0', 10) || 0)
}

export function isNewer(candidate: string, baseline: string): boolean {
  const c = parseSemver(candidate)
  const b = parseSemver(baseline)
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (c[k] > b[k]) return true
    if (c[k] < b[k]) return false
  }
  // Same numeric version — stable beats pre-release
  if (!c.pre && b.pre) return true
  if (c.pre && !b.pre) return false
  if (c.pre && b.pre) return comparePre(c.pre, b.pre) > 0
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
      if (isBetaVersion(current)) {
        await checkAllReleases(current)
      } else {
        await checkLatestStable(current)
      }
    } catch {
      // silent — no network or no release yet
    }
  })

  async function checkLatestStable(current: string) {
    const response = await fetch(STABLE_URL)
    if (!response.ok) return
    const data = (await response.json()) as GithubRelease
    const tag = data.tag_name.replace(/^v/, '')
    if (isNewer(tag, current) && hasPlatformAsset(data.assets ?? [])) {
      latestVersion.value = tag
      updateAvailable.value = true
    }
  }

  async function checkAllReleases(current: string) {
    const response = await fetch(ALL_URL)
    if (!response.ok) return
    const releases = (await response.json()) as GithubRelease[]
    // Find the best candidate: newest semver with platform assets
    let best: string | null = null
    for (const release of releases) {
      if (!hasPlatformAsset(release.assets ?? [])) continue
      const tag = release.tag_name.replace(/^v/, '')
      if (!best || isNewer(tag, best)) best = tag
    }
    if (best && isNewer(best, current)) {
      latestVersion.value = best
      updateAvailable.value = true
    }
  }

  return { updateAvailable, latestVersion, currentVersion }
}
