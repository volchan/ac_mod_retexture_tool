import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { Texture } from '@/types/index'
import ExtractDialog from './ExtractDialog.vue'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
}))

const textures: Texture[] = [
  {
    id: 'a',
    name: 'body.dds',
    path: '/mods/car/car.kn5',
    source: 'kn5',
    kn5File: 'car.kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: '',
    isDecoded: true,
  },
  {
    id: 'b',
    name: 'livery.dds',
    path: '/mods/car/skins/default/livery.dds',
    source: 'skin',
    skinFolder: 'default',
    category: 'livery',
    width: 512,
    height: 512,
    format: 'BC1',
    previewUrl: '',
    isDecoded: true,
  },
]

function bodyText() {
  return document.body.textContent ?? ''
}

function bodyButtons() {
  return Array.from(document.body.querySelectorAll('button'))
}

function findButton(text: string) {
  return bodyButtons().find((b) => b.textContent?.trim() === text)
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  clearInvokeHandlers()
  vi.mocked(listen).mockResolvedValue(() => {})
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('ExtractDialog', () => {
  it('does not render dialog content when closed', () => {
    mount(ExtractDialog, {
      props: { isOpen: false, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders title with texture count', async () => {
    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('Extract 2 textures')
  })

  it('shows singular form for one texture', async () => {
    mount(ExtractDialog, {
      props: { isOpen: true, textures: [textures[0]], modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('Extract 1 texture')
  })

  it('shows Browse button', async () => {
    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()
    const btn = bodyButtons().find((b) => b.textContent?.includes('Browse'))
    expect(btn).toBeDefined()
  })

  it('Browse button calls open dialog', async () => {
    vi.mocked(open).mockResolvedValueOnce('/some/dir')

    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    const btn = bodyButtons().find((b) => b.textContent?.includes('Browse'))
    btn?.click()
    await nextTick()

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false })
  })

  it('shows output structure after folder selected', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    expect(bodyText()).toContain('Output structure')
    expect(bodyText()).toContain('car/car.kn5/')
    expect(bodyText()).toContain('body.png')
  })

  it('Extract button is disabled when no folder selected', async () => {
    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    const extractBtn = findButton('Extract')
    expect(extractBtn?.disabled).toBe(true)
  })

  it('calls extract_textures and shows success', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')
    mockInvokeHandler('extract_textures', () => [])

    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    findButton('Extract')?.click()
    await flush()

    expect(bodyText()).toContain('Extracted successfully')
  })

  it('shows errors returned from extraction', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')
    mockInvokeHandler('extract_textures', () => ['body.dds: decode failed'])

    mount(ExtractDialog, {
      props: { isOpen: true, textures: [textures[0]], modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    findButton('Extract')?.click()
    await flush()

    expect(bodyText()).toContain('body.dds: decode failed')
  })

  it('shows Close button after extraction done', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')
    mockInvokeHandler('extract_textures', () => [])

    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()
    findButton('Extract')?.click()
    await flush()

    expect(findButton('Close')).toBeDefined()
  })

  it('shows correct path for loading screen textures in output tree', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    const heroTextures: Texture[] = [
      {
        id: 'h1',
        name: 'preview_boot.png',
        path: 'ui/boot/preview.png',
        source: 'skin',
        category: 'preview',
        width: 1920,
        height: 1080,
        format: 'PNG',
        previewUrl: '',
        isDecoded: true,
      },
    ]

    mount(ExtractDialog, {
      props: { isOpen: true, textures: heroTextures, modPath: '/mods/track', modName: 'track' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    expect(bodyText()).toContain('track/ui/boot/')
    expect(bodyText()).toContain('preview.png')
  })

  it('Cancel button requires two clicks to close', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    const cancelBtn = document.body.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()
    cancelBtn.click()
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toBeFalsy()

    cancelBtn.click()
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toEqual([[false]])
  })

  it('handleClose returns early when isExtracting', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    let resolveExtract!: () => void
    mockInvokeHandler(
      'extract_textures',
      () =>
        new Promise<string[]>((r) => {
          resolveExtract = () => r([])
        }),
    )

    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    findButton('Extract')?.click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.vm.isExtracting).toBe(true)
    wrapper.vm.handleClose()
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toBeFalsy()

    resolveExtract()
    await flush()
    wrapper.unmount()
  })

  it('handleClose emits done when extraction was completed', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')
    mockInvokeHandler('extract_textures', () => [])

    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()
    findButton('Extract')?.click()
    await flush()

    expect(wrapper.vm.done).toBe(true)
    findButton('Close')?.click()
    await flush()

    expect(wrapper.emitted('done')).toBeTruthy()
    wrapper.unmount()
  })

  it('shows root folder path when folder name is empty', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    const previewTexture: Texture = {
      id: 'p1',
      name: 'preview_boot.png',
      path: 'boot.png',
      source: 'skin',
      category: 'preview',
      width: 1920,
      height: 1080,
      format: 'PNG',
      previewUrl: '',
      isDecoded: true,
    }

    mount(ExtractDialog, {
      props: { isOpen: true, textures: [previewTexture], modPath: '/mods/track', modName: 'track' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    expect(bodyText()).toContain('track/')
  })

  it('extracts skin texture without skinFolder using path directly', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    const skinTexture: Texture = {
      id: 'c',
      name: 'sponsor.dds',
      path: '/mods/car/skins/sponsor.dds',
      source: 'skin',
      category: 'livery',
      width: 256,
      height: 256,
      format: 'BC1',
      previewUrl: '',
      isDecoded: true,
    }
    mockInvokeHandler('extract_textures', () => [])

    mount(ExtractDialog, {
      props: {
        isOpen: true,
        textures: [...textures, skinTexture],
        modPath: '/mods/car',
        modName: 'car',
      },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()
    findButton('Extract')?.click()
    await flush()

    expect(bodyText()).toContain('Extracted successfully')
  })

  it('fires extract-progress callback and updates progress', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    type ProgressCb = (e: { payload: unknown }) => void
    let progressHandler: ProgressCb | undefined
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      if (eventName === 'extract-progress') progressHandler = handler as ProgressCb
      return () => {}
    })

    mockInvokeHandler('extract_textures', () => {
      progressHandler?.({ payload: { current: 1, total: 3, label: 'body.dds' } })
      return []
    })

    mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()

    findButton('Extract')?.click()
    await flush()

    expect(document.body.textContent).toContain('Extracted successfully')
  })

  it('dialog v-model close emits update:isOpen', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    const dialog = wrapper.findComponent({ name: 'Dialog' })
    await dialog.vm.$emit('update:open', false)
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toEqual([[false]])
    wrapper.unmount()
  })

  it('interact-outside event does not close dialog', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    wrapper.vm.preventInteractOutside({ preventDefault: vi.fn() })
    await nextTick()

    expect(wrapper.vm.dialogOpen).toBe(true)
    wrapper.unmount()
  })

  it('handleExtract returns early when outputDir is empty', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.vm.handleExtract()

    expect(wrapper.vm.isExtracting).toBe(false)
    expect(wrapper.vm.done).toBe(false)
    wrapper.unmount()
  })

  it('handleEscapeKey calls handleClose when done', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')
    mockInvokeHandler('extract_textures', () => [])

    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()
    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()
    findButton('Extract')?.click()
    await flush()

    expect(wrapper.vm.done).toBe(true)
    wrapper.vm.handleEscapeKey()
    await nextTick()
    expect(wrapper.emitted('update:isOpen')).toBeTruthy()
    wrapper.unmount()
  })

  it('handleEscapeKey requests cancel when not done and not extracting', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    wrapper.vm.handleEscapeKey()
    await nextTick()
    expect(wrapper.vm.cancelConfirm.confirming.value).toBe(true)
    wrapper.unmount()
  })

  it('handleEscapeKey does nothing when isExtracting', async () => {
    vi.mocked(open).mockResolvedValueOnce('/output')

    let resolveExtract!: () => void
    mockInvokeHandler(
      'extract_textures',
      () =>
        new Promise<string[]>((r) => {
          resolveExtract = () => r([])
        }),
    )

    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()
    bodyButtons()
      .find((b) => b.textContent?.includes('Browse'))
      ?.click()
    await flush()
    findButton('Extract')?.click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.vm.isExtracting).toBe(true)
    wrapper.vm.handleEscapeKey()
    await nextTick()
    expect(wrapper.emitted('update:isOpen')).toBeFalsy()
    expect(wrapper.vm.cancelConfirm.confirming.value).toBe(false)

    resolveExtract()
    await flush()
    wrapper.unmount()
  })

  it('resets cancelConfirm when dialog closes externally', async () => {
    const wrapper = mount(ExtractDialog, {
      props: { isOpen: true, textures, modPath: '/mods/car', modName: 'car' },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.setProps({ isOpen: false })
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toBeFalsy()
  })
})
