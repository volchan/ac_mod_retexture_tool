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

  it('Cancel button emits update:isOpen false', async () => {
    const wrapper = mount(ImportConfirmDialog, {
      props: { isOpen: true, matched: [makeMatched()], unmatched: [] },
      attachTo: document.body,
    })
    await nextTick()
    findButton('Cancel')?.click()
    await nextTick()
    expect(wrapper.emitted('update:isOpen')).toEqual([[false]])
  })
})
