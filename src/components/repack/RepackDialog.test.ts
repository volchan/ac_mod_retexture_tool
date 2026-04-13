import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Mod, TextureReplacementOpt } from '@/types/index'
import RepackDialog from './RepackDialog.vue'

vi.mock('@/lib/tauri', () => ({
  repackMod: vi.fn(),
  onRepackProgress: vi.fn(async () => () => {}),
}))

import { useRepack } from '@/composables/useRepack'
import { repackMod } from '@/lib/tauri'

const mod: Mod = {
  modType: 'car',
  path: '/mods/ferrari_488',
  meta: {
    name: 'Ferrari 488',
    folderName: 'ferrari_488',
    author: 'Kunos',
    version: '1.0',
    description: '',
  },
  carMeta: { brand: 'Ferrari', carClass: 'GT3', bhp: 670, weight: 1340 },
  files: [],
  kn5Files: ['ferrari_488.kn5'],
  skinFolders: [],
}

const replacements: TextureReplacementOpt[] = [
  {
    textureId: 'tex_1',
    sourcePath: '/import/body.png',
    kn5File: '/mods/ferrari_488/ferrari_488.kn5',
    textureName: 'body.dds',
    originalFormat: 'BC3',
    heroImagePath: undefined,
  },
]

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  await nextTick()
}

function bodyText() {
  return document.body.textContent ?? ''
}

function bodyButtons() {
  return Array.from(document.body.querySelectorAll('button'))
}

function findButton(text: string) {
  return bodyButtons().find((b) => b.textContent?.includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
  const { reset } = useRepack()
  reset()
})

describe('RepackDialog', () => {
  it('renders title and description', async () => {
    mount(RepackDialog, {
      props: {
        open: true,
        mod,
        outputPath: '/output/car.zip',
        replacements,
      },
    })
    await flush()
    expect(bodyText()).toContain('Repack mod')
    expect(bodyText()).toContain('1 texture')
  })

  it('shows output path', async () => {
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/Users/user/Desktop/car.zip', replacements },
    })
    await flush()
    expect(bodyText()).toContain('/Users/user/Desktop/car.zip')
  })

  it('shows mod info summary', async () => {
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()
    expect(bodyText()).toContain('Ferrari 488')
    expect(bodyText()).toContain('ferrari_488')
    expect(bodyText()).toContain('Kunos')
  })

  it('shows replacement count', async () => {
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()
    expect(bodyText()).toContain('1 recompiled')
  })

  it('calls repackMod on confirm click', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    const btn = findButton('Confirm')
    expect(btn).toBeTruthy()
    btn?.click()
    await flush()

    expect(repackMod).toHaveBeenCalledOnce()
    const callArg = vi.mocked(repackMod).mock.calls[0][0]
    expect(callArg.modPath).toBe('/mods/ferrari_488')
    expect(callArg.outputPath).toBe('/out/car.zip')
  })

  it('shows success message after repack completes', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await flush()

    expect(bodyText()).toContain('successfully')
  })

  it('shows error message when repack fails', async () => {
    vi.mocked(repackMod).mockRejectedValueOnce(new Error('write error'))
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await flush()

    expect(bodyText()).toContain('write error')
  })

  it('shows Cancel button initially', async () => {
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()
    expect(findButton('Cancel')).toBeTruthy()
  })

  it('shows Close after done', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await flush()

    expect(findButton('Close')).toBeTruthy()
  })

  it('counts hero image replacements in replacement count', async () => {
    const heroReplacement: TextureReplacementOpt = {
      textureId: 'hero_1',
      sourcePath: '/import/preview.png',
      textureName: 'preview.png',
      originalFormat: 'PNG',
      heroImagePath: 'ui/preview.png',
    }
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements: [heroReplacement] },
    })
    await flush()
    expect(bodyText()).toContain('1 recompiled')
  })

  it('labelToStep maps labels to correct step indices', () => {
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    const vm = wrapper.vm as InstanceType<typeof RepackDialog>
    expect(vm.labelToStep('Copying files')).toBe(0)
    expect(vm.labelToStep('Updating metadata')).toBe(1)
    expect(vm.labelToStep('Recompiling textures in car.kn5')).toBe(2)
    expect(vm.labelToStep('Archiving mod')).toBe(3)
    expect(vm.labelToStep('')).toBe(-1)
  })

  it('Cancel button requires two clicks to close', async () => {
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    const cancelBtn = document.body.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()
    await flush()

    expect(wrapper.emitted('update:open')).toBeFalsy()

    cancelBtn.click()
    await flush()

    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
  })
})
