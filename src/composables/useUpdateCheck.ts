import { computed, onMounted, ref } from 'vue'
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
  const parsePrerelease = (s: string) => {
    const parts = s.split('.')
    const label = /^[a-z]+$/i.test(parts[0]) ? parts[0].toLowerCase() : ''
    const nums = (label ? parts.slice(1) : parts).map((p) => parseInt(p, 10) || 0)
    return { label, nums }
  }
  const pa = parsePrerelease(a)
  const pb = parsePrerelease(b)
  if (pa.label !== pb.label) {
    const orderA = PRE_ORDER[pa.label] ?? 99
    const orderB = PRE_ORDER[pb.label] ?? 99
    return orderA - orderB
  }
  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
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

const RELEASE_BASE = `https://github.com/${REPO}/releases`

export function releaseUrlFor(version: string): string {
  const v = version.replace(/^v/i, '')
  if (isBetaVersion(v)) return `${RELEASE_BASE}/tag/v${v}`
  return `${RELEASE_BASE}/latest`
}

export function useUpdateCheck() {
  const updateAvailable = ref(false)
  const latestVersion = ref('')
  const currentVersion = ref('')
  const releaseUrl = computed(() => releaseUrlFor(latestVersion.value))

  onMounted(async () => {
    const current = await getAppVersion()
    currentVersion.value = current

    try {
      if (isBetaVersion(current)) {
        await checkAllReleases(current)
      } else {
        await checkLatestStable(current)
      }
    } catch (error) {
      console.debug('[useUpdateCheck] Update check skipped:', error)
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

  return { updateAvailable, latestVersion, currentVersion, releaseUrl }
}
