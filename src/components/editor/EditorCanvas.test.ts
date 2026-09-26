import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useEditorTools } from '@/composables/useEditorTools'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { bucketLayer, imageLayer } from '@/test-fixtures/layers'
import type { Texture } from '@/types/index'
import EditorCanvas from './EditorCanvas.vue'

const mocks = vi.hoisted(() => ({
  pickColor: vi.fn(() => '#abcdef'),
  maskFor: vi.fn(() => ({ canvas: {} as HTMLCanvasElement, x: 12, y: 34 })),
  previewMask: vi.fn(() => ({ canvas: {} as HTMLCanvasElement, x: 5, y: 6 })),
}))

vi.mock('@/lib/stageExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stageExport')>()
  return { ...actual, pickColor: mocks.pickColor }
})

vi.mock('@/composables/useBucketMasks', () => ({
  useBucketMasks: () => ({
    maskFor: mocks.maskFor,
    previewMask: mocks.previewMask,
    clearMasks: vi.fn(),
  }),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => null) }))

const texture = { id: 'tex1', name: 'skin_body.dds', width: 1024, height: 512 } as Texture

const KONVA_STUBS = [
  'v-stage',
  'v-layer',
  'v-image',
  'v-text',
  'v-text-path',
  'v-rect',
  'v-ellipse',
  'v-line',
  'v-circle',
  'v-transformer',
]

/// Konva never runs here — jsdom has no canvas context — so the stage is faked and
/// only the decisions the component makes around it are under test.
function fakeStage(point: { x: number; y: number } | null = { x: 40, y: 80 }) {
  return {
    getRelativePointerPosition: () => point,
    getClassName: () => 'Stage',
    getParent: () => null,
    id: () => '',
  } as unknown as import('konva').default.Stage
}

function canvas(props: Partial<InstanceType<typeof EditorCanvas>['$props']> = {}) {
  return mount(EditorCanvas, {
    props: {
      width: 800,
      height: 600,
      scale: 1,
      position: { x: 0, y: 0 },
      baseImage: null,
      textureWidth: 1024,
      textureHeight: 512,
      uvTemplate: null,
      uvOpacity: 0.5,
      hoverPoint: null,
      ...props,
    },
    global: { stubs: Object.fromEntries(KONVA_STUBS.map((name) => [name, true])) },
  })
}

function pressOn(wrapper: ReturnType<typeof canvas>, stage = fakeStage()) {
  wrapper.vm.stageRef = { getStage: () => stage }
  wrapper.vm.handlePointerDown({
    target: { id: () => 'layer-1', getClassName: () => 'Image', getParent: () => null },
    evt: { clientX: 0, clientY: 0 },
  } as never)
}

describe('EditorCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLiveryDocument().init(texture)
    useEditorTools().setTool('select')
  })

  it('selects the node that was pressed', () => {
    const wrapper = canvas()
    pressOn(wrapper)
    expect(useLiveryDocument().selectedId.value).toBe('layer-1')
  })

  it('drops the selection and starts a pan on the background', () => {
    const wrapper = canvas()
    useLiveryDocument().select('layer-1')
    const stage = fakeStage()
    wrapper.vm.stageRef = { getStage: () => stage }
    wrapper.vm.handlePointerDown({
      target: stage,
      evt: { clientX: 10, clientY: 10 },
    } as never)

    expect(useLiveryDocument().selectedId.value).toBeNull()
  })

  it('emits the travelled distance while panning', () => {
    const wrapper = canvas()
    const stage = fakeStage()
    wrapper.vm.stageRef = { getStage: () => stage }
    wrapper.vm.handlePointerDown({ target: stage, evt: { clientX: 10, clientY: 10 } } as never)

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 25, clientY: 4 }))
    expect(wrapper.emitted('pan')?.at(-1)).toEqual([{ x: 15, y: -6 }])

    window.dispatchEvent(new PointerEvent('pointerup'))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 99, clientY: 99 }))
    expect(wrapper.emitted('pan')).toHaveLength(1)
  })

  /// Closing the editor mid-drag never fires the pointerup that detaches the
  /// listeners, and they keep emitting at a component that is gone.
  it('detaches the pan listeners when it unmounts mid-drag', () => {
    const wrapper = canvas()
    const stage = fakeStage()
    wrapper.vm.stageRef = { getStage: () => stage }
    wrapper.vm.handlePointerDown({ target: stage, evt: { clientX: 0, clientY: 0 } } as never)

    wrapper.unmount()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    expect(wrapper.emitted('pan')).toBeUndefined()
  })

  it('samples the colour under the pipette and arms the brush with it', () => {
    useEditorTools().setTool('eyedropper')
    pressOn(canvas())

    expect(mocks.pickColor).toHaveBeenCalledWith(expect.anything(), 40, 80)
    expect(useEditorTools().brushColor.value).toBe('#abcdef')
  })

  it('leaves the colour alone when the pixel under the pipette is transparent', () => {
    mocks.pickColor.mockReturnValueOnce(null as never)
    useEditorTools().setTool('eyedropper')
    const before = useEditorTools().brushColor.value

    pressOn(canvas())
    expect(useEditorTools().brushColor.value).toBe(before)
  })

  it('drops a fill layer where the bucket was clicked', () => {
    useEditorTools().setTool('bucket')
    pressOn(canvas())

    expect(useLiveryDocument().layers.value.at(-1)).toMatchObject({
      type: 'bucket',
      x: 40,
      y: 80,
    })
  })

  it('starts a stroke under the brush', () => {
    useEditorTools().setTool('brush')
    const wrapper = canvas()
    pressOn(wrapper)
    expect(wrapper.vm.liveStroke).toMatchObject({ points: [40, 80] })
  })

  it('keeps its hands off a press that landed on the transformer', () => {
    const wrapper = canvas()
    useLiveryDocument().select('kept')
    wrapper.vm.stageRef = { getStage: () => fakeStage() }
    wrapper.vm.handlePointerDown({
      target: { id: () => '', getClassName: () => 'Transformer', getParent: () => null },
      evt: {},
    } as never)

    expect(useLiveryDocument().selectedId.value).toBe('kept')
  })

  it('reports the texture coordinate under the cursor', () => {
    const wrapper = canvas()
    wrapper.vm.stageRef = { getStage: () => fakeStage({ x: 7, y: 9 }) }
    wrapper.vm.handlePointerMove()
    expect(wrapper.emitted('hoverTexture')?.at(-1)).toEqual([{ x: 7, y: 9 }])

    wrapper.vm.handlePointerLeave()
    expect(wrapper.emitted('hoverTexture')?.at(-1)).toEqual([null])
  })

  it('grows the live stroke as the cursor travels', () => {
    useEditorTools().setTool('brush')
    const wrapper = canvas()
    pressOn(wrapper)
    wrapper.vm.stageRef = { getStage: () => fakeStage({ x: 50, y: 90 }) }
    wrapper.vm.handlePointerMove()

    expect(wrapper.vm.liveStroke?.points).toEqual([40, 80, 50, 90])
  })

  it('commits a finished stroke into a paint layer', () => {
    useEditorTools().setTool('brush')
    const wrapper = canvas()
    pressOn(wrapper)
    wrapper.vm.stageRef = { getStage: () => fakeStage({ x: 60, y: 60 }) }
    wrapper.vm.handlePointerMove()
    wrapper.vm.handlePointerUp()

    const layer = useLiveryDocument().layers.value.at(-1)
    expect(layer).toMatchObject({ type: 'strokes' })
    expect(layer?.type === 'strokes' && layer.strokes).toHaveLength(1)
    expect(wrapper.vm.liveStroke).toBeNull()
  })

  /// A tap is a click, not a stroke: committing it would spend an undo entry on a
  /// paint layer holding a single point.
  it('throws away a stroke that never moved', () => {
    useEditorTools().setTool('brush')
    const wrapper = canvas()
    pressOn(wrapper)
    wrapper.vm.handlePointerUp()

    expect(useLiveryDocument().layers.value).toEqual([])
  })

  it('paints a fill layer at its mask origin rather than at the sheet corner', () => {
    const wrapper = canvas()
    expect(wrapper.vm.config(bucketLayer())).toMatchObject({ x: 12, y: 34 })
  })

  it('marks the fill highlight as chrome so it never reaches the saved sheet', () => {
    const wrapper = canvas()
    expect(wrapper.vm.previewConfig({ canvas: {} as HTMLCanvasElement, x: 5, y: 6 })).toMatchObject(
      {
        name: 'editor-chrome',
        listening: false,
        x: 5,
        y: 6,
      },
    )
  })

  it('previews the region the bucket would fill once the cursor settles', async () => {
    vi.useFakeTimers()
    useEditorTools().setTool('bucket')
    const wrapper = canvas()
    wrapper.vm.stageRef = { getStage: () => fakeStage({ x: 11, y: 22 }) }
    wrapper.vm.handlePointerMove()

    await vi.advanceTimersByTimeAsync(200)
    expect(mocks.previewMask).toHaveBeenCalledWith(
      { x: 11, y: 22 },
      32,
      expect.any(String),
      null,
      'colour',
    )
    expect(wrapper.vm.fillPreview).toMatchObject({ x: 5, y: 6 })
    vi.useRealTimers()
  })

  /// A livery panel is rarely one flat colour, so matching the seed's colour
  /// recolours the stripe rather than the panel it runs across.
  it('fills the whole island when the bucket is clicked with shift held', () => {
    useEditorTools().setTool('bucket')
    const wrapper = canvas()
    const stage = fakeStage({ x: 11, y: 22 })
    wrapper.vm.stageRef = { getStage: () => stage }
    wrapper.vm.handlePointerDown({ target: stage, evt: { shiftKey: true } } as never)

    expect(useLiveryDocument().layers.value[0]).toMatchObject({ type: 'bucket', mode: 'zone' })
  })

  it('matches the colour under the bucket when shift is not held', () => {
    useEditorTools().setTool('bucket')
    const wrapper = canvas()
    const stage = fakeStage({ x: 11, y: 22 })
    wrapper.vm.stageRef = { getStage: () => stage }
    wrapper.vm.handlePointerDown({ target: stage, evt: {} } as never)

    expect(useLiveryDocument().layers.value[0]).toMatchObject({ mode: 'colour' })
  })

  it('previews nothing while a tool other than the bucket is held', async () => {
    vi.useFakeTimers()
    const wrapper = canvas()
    wrapper.vm.stageRef = { getStage: () => fakeStage() }
    wrapper.vm.handlePointerMove()

    await vi.advanceTimersByTimeAsync(200)
    expect(mocks.previewMask).not.toHaveBeenCalled()
    expect(wrapper.vm.fillPreview).toBeNull()
    vi.useRealTimers()
  })

  it('hands out no stage before Konva has mounted one', async () => {
    const wrapper = canvas()
    wrapper.vm.registerNode('a', { getNode: () => ({ id: () => 'a' }) })
    wrapper.vm.registerNode('a', null)
    wrapper.vm.stageRef = null
    await nextTick()
    expect(wrapper.vm.getStage()).toBeNull()
  })

  it('tracks a node through the whole drag, not only where it lands', () => {
    const wrapper = canvas()
    useLiveryDocument().addLayer(imageLayer({ id: 'a' }))
    wrapper.vm.handleDragMove(
      { target: { x: () => 5, y: () => 7 } } as never,
      imageLayer({ id: 'a' }),
    )

    expect(useLiveryDocument().layers.value[0]).toMatchObject({ x: 5, y: 7 })
  })

  it('stores every property a transform changed', () => {
    const wrapper = canvas()
    useLiveryDocument().addLayer(imageLayer({ id: 'a' }))
    wrapper.vm.handleTransform(
      {
        target: {
          x: () => 1,
          y: () => 2,
          scaleX: () => 3,
          scaleY: () => 4,
          rotation: () => 5,
        },
      } as never,
      imageLayer({ id: 'a' }),
    )

    expect(useLiveryDocument().layers.value[0]).toMatchObject({
      x: 1,
      y: 2,
      scaleX: 3,
      scaleY: 4,
      rotation: 5,
    })
  })
})
