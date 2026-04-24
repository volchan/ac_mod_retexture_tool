import { open } from '@tauri-apps/plugin-dialog'
import { load } from '@tauri-apps/plugin-store'
import { ref } from 'vue'
import { getIsWindows } from '@/lib/platform'
import { detectAcInstall, onAcProbe, validateAcFolder } from '@/lib/tauri'
import type { AcDetectPhase, AcInstall, AcInstallInfo, AcProbeResult } from '@/types/index'

const STORE_KEY = 'ac-install'

export function useAcDetection() {
  const phase = ref<AcDetectPhase>('idle')
  const install = ref<AcInstall | null>(null)
  const installInfo = ref<AcInstallInfo | null>(null)
  const probes = ref<AcProbeResult[]>([])
  const validationError = ref<string | null>(null)

  async function persist(acInstall: AcInstall): Promise<void> {
    install.value = acInstall
    const store = await load('settings.json')
    await store.set(STORE_KEY, acInstall)
    await store.save()
  }

  async function startDetection(): Promise<void> {
    phase.value = 'detecting'
    probes.value = []

    const unlisten = await onAcProbe((event) => {
      const idx = probes.value.findIndex((p) => p.path === event.path)
      const probe: AcProbeResult = {
        path: event.path,
        label: event.label,
        status: event.status as AcProbeResult['status'],
      }
      if (idx >= 0) {
        probes.value[idx] = probe
      } else {
        probes.value.push(probe)
      }
    })

    try {
      const result = await detectAcInstall()
      if (result.candidates.length > 0) {
        const candidate = result.candidates[0]
        const acInstall: AcInstall = {
          path: candidate.path,
          detectedAt: new Date().toISOString(),
          source: 'auto',
          version: candidate.version,
        }
        await persist(acInstall)
        installInfo.value = {
          path: candidate.path,
          version: candidate.version,
          carCount: candidate.carCount,
          trackCount: candidate.trackCount,
        }
        phase.value = 'detected'
      } else {
        phase.value = 'not_found'
      }
    } finally {
      unlisten()
    }
  }

  async function init(): Promise<void> {
    const store = await load('settings.json')
    const cached = await store.get<AcInstall>(STORE_KEY)

    if (cached) {
      try {
        const info = await validateAcFolder(cached.path)
        install.value = cached
        installInfo.value = info
        phase.value = 'detected'
        return
      } catch {
        // cached path is invalid, fall through
      }
    }

    if (getIsWindows()) {
      await startDetection()
    } else {
      phase.value = 'not_found'
    }
  }

  async function pickManually(): Promise<void> {
    const selected = await open({ directory: true })
    if (!selected || typeof selected !== 'string') return

    try {
      const info = await validateAcFolder(selected)
      const acInstall: AcInstall = {
        path: selected,
        detectedAt: new Date().toISOString(),
        source: 'manual',
        version: info.version,
      }
      await persist(acInstall)
      installInfo.value = info
      phase.value = 'detected'
    } catch (err) {
      validationError.value = typeof err === 'string' ? err : String(err)
    }
  }

  async function rescan(): Promise<void> {
    install.value = null
    installInfo.value = null
    await startDetection()
  }

  async function changeLocation(): Promise<void> {
    await pickManually()
  }

  return {
    phase,
    install,
    installInfo,
    probes,
    validationError,
    init,
    startDetection,
    pickManually,
    rescan,
    changeLocation,
  }
}
