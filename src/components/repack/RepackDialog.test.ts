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
import { onRepackProgress, repackMod } from '@/lib/tauri'
import type { ProgressInfo } from '@/types/index'

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

  it('close does nothing when isRepacking', async () => {
    let resolveRepack!: () => void
    vi.mocked(repackMod).mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveRepack = r
        }),
    )

    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.vm.isRepacking).toBe(true)
    wrapper.vm.close()
    await nextTick()

    expect(wrapper.emitted('update:open')).toBeFalsy()

    resolveRepack()
    await flush()
    wrapper.unmount()
  })

  it('close emits done after repack completes', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)

    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await flush()

    expect(wrapper.vm.repackDone).toBe(true)
    findButton('Close')?.click()
    await flush()

    expect(wrapper.emitted('done')).toBeTruthy()
    wrapper.unmount()
  })

  it('shows plural texture count for 2 replacements', async () => {
    const twoReplacements = [
      replacements[0],
      {
        textureId: 'tex_2',
        sourcePath: '/import/livery.png',
        kn5File: '/mods/ferrari_488/ferrari_488.kn5',
        textureName: 'livery.dds',
        originalFormat: 'BC1',
        heroImagePath: undefined,
      },
    ]
    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements: twoReplacements },
    })
    await flush()
    expect(bodyText()).toContain('2 textures')
  })

  it('fires progress events updating step state', async () => {
    let progressCb!: (info: ProgressInfo) => void
    vi.mocked(onRepackProgress).mockImplementationOnce(async (handler) => {
      progressCb = handler
      return () => {}
    })
    vi.mocked(repackMod).mockImplementationOnce(async () => {
      progressCb({ current: 1, total: 4, label: 'Copying files' })
      progressCb({ current: 2, total: 4, label: 'Updating metadata' })
      progressCb({ current: 3, total: 4, label: 'Recompiling textures in car.kn5' })
      progressCb({ current: 4, total: 4, label: 'Archiving mod' })
    })

    mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    findButton('Confirm')?.click()
    await flush()

    expect(bodyText()).toContain('successfully')
  })

  it('handleEscapeKey calls close when repackDone', async () => {
    vi.mocked(repackMod).mockResolvedValueOnce(undefined)
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()
    findButton('Confirm')?.click()
    await flush()

    expect(wrapper.vm.repackDone).toBe(true)
    wrapper.vm.handleEscapeKey()
    await flush()
    expect(wrapper.emitted('update:open')).toBeTruthy()
    wrapper.unmount()
  })

  it('handleEscapeKey requests cancel when not done and not repacking', async () => {
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    wrapper.vm.handleEscapeKey()
    await flush()
    expect(wrapper.vm.cancelConfirm.confirming.value).toBe(true)
    wrapper.unmount()
  })

  it('handleEscapeKey does nothing when isRepacking', async () => {
    let resolveRepack!: () => void
    vi.mocked(repackMod).mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveRepack = r
        }),
    )
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()
    findButton('Confirm')?.click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.vm.isRepacking).toBe(true)
    wrapper.vm.handleEscapeKey()
    await nextTick()
    expect(wrapper.emitted('update:open')).toBeFalsy()
    expect(wrapper.vm.cancelConfirm.confirming.value).toBe(false)

    resolveRepack()
    await flush()
    wrapper.unmount()
  })

  it('resets cancelConfirm when dialog closes externally', async () => {
    const wrapper = mount(RepackDialog, {
      props: { open: true, mod, outputPath: '/out/car.zip', replacements },
    })
    await flush()

    await wrapper.setProps({ open: false })
    await flush()

    expect(wrapper.emitted('update:open')).toBeFalsy()
    wrapper.unmount()
  })
})
