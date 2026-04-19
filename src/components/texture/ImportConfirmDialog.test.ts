import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { MatchedTexture, Texture, UnmatchedFile } from '@/types/index'
import ImportConfirmDialog from './ImportConfirmDialog.vue'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body_diffuse.dds',
    path: '/mods/car/car.kn5',
    source: 'kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: '',
    isDecoded: true,
    ...overrides,
  }
}

function makeMatched(overrides: Partial<MatchedTexture> = {}): MatchedTexture {
  return {
    texture: makeTexture(),
    sourcePath: '/import/body_diffuse.png',
    previewUrl: 'data:image/png;base64,abc',
    sourceWidth: 1024,
    sourceHeight: 1024,
    hasDimensionMismatch: false,
    ...overrides,
  }
}

const unmatched: UnmatchedFile[] = [
  { name: 'notes.txt', reason: 'No matching texture found in the mod' },
]

function bodyText() {
  return document.body.textContent ?? ''
}

function findButton(text: string) {
  return Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  )
}

describe('ImportConfirmDialog', () => {
  it('does not render when closed', () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: false, matched: [], unmatched: [] },
      attachTo: document.body,
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows correct title for multiple matches', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [makeMatched(), makeMatched({ texture: makeTexture({ id: 'b' }) })],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('Replace 2 textures?')
  })

  it('shows singular title for one match', async () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('Replace 1 texture?')
  })

  it('shows matched texture names', async () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('body_diffuse.dds')
  })

  it('shows dimension mismatch warning when present', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [
          makeMatched({ sourceWidth: 2048, sourceHeight: 2048, hasDimensionMismatch: true }),
        ],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('different dimensions')
  })

  it('shows singular mismatch text for exactly one mismatch', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [
          makeMatched({ hasDimensionMismatch: true }),
          makeMatched({ texture: makeTexture({ id: 'b' }), hasDimensionMismatch: false }),
        ],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('1 texture has different dimensions')
  })

  it('does not show mismatch warning when all dimensions match', async () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).not.toContain('different dimensions')
  })

  it('shows unmatched files section when present', async () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched },
      attachTo: document.body,
    })
    await nextTick()
    expect(bodyText()).toContain('notes.txt')
    expect(bodyText()).toContain('No matching texture found in the mod')
  })

  it('Apply button is disabled when no matches', async () => {
    mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [], unmatched },
      attachTo: document.body,
    })
    await nextTick()
    const applyBtn = findButton('Apply 0 replacements')
    expect(applyBtn?.disabled).toBe(true)
  })

  it('Apply button emits apply with matched list', async () => {
    const matched = [makeMatched()]
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched, unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()
    findButton('Apply 1 replacement')?.click()
    await nextTick()
    expect(wrapper.emitted('apply')).toEqual([[matched]])
    expect(wrapper.emitted('update:isOpen')).toEqual([[false]])
  })

  it('Cancel button requires two clicks to close', async () => {
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
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

  it('resets cancelConfirm when dialog closes externally', async () => {
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.setProps({ isOpen: false })
    await nextTick()

    expect(wrapper.emitted('update:isOpen')).toBeFalsy()
  })

  it('dialog v-model close emits update:isOpen', async () => {
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
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
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()

    wrapper.vm.preventInteractOutside({ preventDefault: vi.fn() })
    await nextTick()

    expect(wrapper.vm.open).toBe(true)
    wrapper.unmount()
  })

  it('shows plural mismatch text for two mismatches', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [
          makeMatched({ hasDimensionMismatch: true }),
          makeMatched({ texture: makeTexture({ id: 'b' }), hasDimensionMismatch: true }),
        ],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.body.textContent).toContain('2 textures have different dimensions')
  })

  it('handleEscapeKey triggers cancel confirm', async () => {
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()

    wrapper.vm.handleEscapeKey()
    await nextTick()
    expect(wrapper.vm.cancelConfirm.confirming.value).toBe(true)
    wrapper.unmount()
  })

  it('sourceLabel returns skinFolder path when kn5File absent', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [makeMatched({ texture: makeTexture({ kn5File: undefined, skinFolder: 'red' }) })],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.body.textContent).toContain('skins/red')
  })

  it('sourceLabel returns path basename when no kn5File or skinFolder', async () => {
    mount(ImportConfirmDialog, {
      props: {
        isOpen: true,
        matched: [
          makeMatched({
            texture: makeTexture({
              kn5File: undefined,
              skinFolder: undefined,
              path: '/mods/car/body.dds',
            }),
          }),
        ],
        unmatched: [],
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(document.body.textContent).toContain('body.dds')
  })
})
