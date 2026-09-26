<script setup lang="ts">
import { useRafFn, watchDebounced } from '@vueuse/core'
import type Konva from 'konva'
import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { type BucketMask, useBucketMasks } from '@/composables/useBucketMasks'
import { useEditorTools } from '@/composables/useEditorTools'
import { useImageAssets } from '@/composables/useImageAssets'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { layerConfig, strokeConfigs, transformerConfig } from '@/lib/editorConfig'
import { pointerIntent } from '@/lib/editorPointer'
import type { FillMode } from '@/lib/floodFill'
import { pickColor } from '@/lib/stageExport'
import type { BrushStroke, EditorLayer, StrokeLayer } from '@/types/index'

const props = defineProps<{
  width: number
  height: number
  scale: number
  position: { x: number; y: number }
  baseImage: HTMLImageElement | null
  textureWidth: number
  textureHeight: number
  uvTemplate: HTMLImageElement | null
  uvOpacity: number
  hoverPoint: { x: number; y: number } | null
}>()

const emit = defineEmits<{
  pan: [{ x: number; y: number }]
  hoverTexture: [{ x: number; y: number } | null]
}>()

const { layers, selectedId, updateLayer, holdEdits, releaseEdits, select } = useLiveryDocument()
const {
  tool,
  strokeTarget,
  newStroke,
  addBucketLayer,
  sampleColor,
  mirrored,
  fillColor,
  fillTolerance,
} = useEditorTools()
const { maskFor, previewMask } = useBucketMasks()
const { resolve } = useImageAssets()

/// How wide the pulse swings, and how long a full swing takes. Slow enough to
/// read as breathing rather than strobing.
const PULSE = { low: 0.25, high: 0.65, periodMs: 1100 }

/// Flood filling a 4K sheet costs tens of milliseconds, far too much to run on
/// every pointer event: the region is worked out once the cursor settles.
const HOVER_SETTLE_MS = 90

const stageRef = ref<{ getStage: () => Konva.Stage } | null>(null)
const transformerRef = ref<{ getNode: () => Konva.Transformer } | null>(null)
const previewLayerRef = ref<{ getNode: () => Konva.Layer } | null>(null)
const liveStroke = shallowRef<BrushStroke | null>(null)

// Closing the editor mid-drag never fires the pointerup that would detach the
// pan listeners, and they keep emitting at a component that is gone.
let stopPan: (() => void) | null = null
const pointer = shallowRef<{ x: number; y: number } | null>(null)
const fillPreview = shallowRef<BucketMask | null>(null)
/// Held shift swaps the bucket from matching a colour to taking the whole
/// island, so the highlight has to follow the key as well as the pointer.
const fillMode = shallowRef<FillMode>('colour')

// Konva nodes registered as they mount, rather than looked up by id: a freshly
// added layer has no node yet when the selection watcher runs.
const nodes = new Map<string, Konva.Node>()

function registerNode(id: string, instance: unknown) {
  const handle = instance as { getNode?: () => Konva.Node } | null
  if (handle?.getNode) nodes.set(id, handle.getNode())
  else nodes.delete(id)
}

watch(
  [selectedId, layers, tool],
  () => {
    const transformer = transformerRef.value?.getNode()
    if (!transformer) return
    const node = selectedId.value ? nodes.get(selectedId.value) : undefined
    transformer.nodes(node && tool.value === 'select' ? [node] : [])
    transformer.getLayer()?.batchDraw()
  },
  { flush: 'post' },
)

/// The pulse is driven straight onto the Konva node instead of through a reactive
/// opacity: a ref would re-render every layer sixty times a second. Its own layer
/// keeps the redraw to one small bitmap rather than the whole sheet.
const pulse = useRafFn(
  () => {
    const node = previewLayerRef.value?.getNode()
    if (!node) return
    const phase = (Math.sin((Date.now() / PULSE.periodMs) * Math.PI * 2) + 1) / 2
    node.opacity(PULSE.low + (PULSE.high - PULSE.low) * phase)
    node.batchDraw()
  },
  { immediate: false },
)

watchDebounced([pointer, tool, fillColor, fillTolerance, fillMode], recomputeFillPreview, {
  debounce: HOVER_SETTLE_MS,
})

watch(fillPreview, (preview) => (preview ? pulse.resume() : pulse.pause()), { flush: 'post' })

onBeforeUnmount(() => {
  pulse.pause()
  stopPan?.()
})

function config(layer: EditorLayer) {
  const { image, origin } = bitmapFor(layer)
  return layerConfig(layer, { image, origin, interactive: tool.value === 'select' })
}

/// The document has to track the node while it moves, not only once it lands:
/// any re-render in between re-applies the stored placement and would otherwise
/// snap the node back under the cursor.
function handleDragMove(e: Konva.KonvaEventObject<DragEvent>, layer: EditorLayer) {
  updateLayer(layer.id, { x: e.target.x(), y: e.target.y() })
}

function handleTransform(e: Konva.KonvaEventObject<Event>, layer: EditorLayer) {
  const node = e.target
  updateLayer(layer.id, {
    x: node.x(),
    y: node.y(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  })
}

function handlePointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
  const stage = stageRef.value?.getStage()
  if (!stage) return

  const intent = pointerIntent(tool.value, {
    isStage: e.target === stage,
    onTransformer: isOnTransformer(e.target),
    id: e.target.id() ?? '',
  })

  // A transform is Konva's to run: touching the selection here would detach the
  // handles the user just grabbed.
  if (intent.kind === 'transform') return
  if (intent.kind === 'paint') startStroke(stage)
  if (intent.kind === 'fill') fillAtPointer(stage, heldMode(e.evt))
  if (intent.kind === 'pick') pickAtPointer(stage)
  if (intent.kind === 'pan') {
    select(null)
    startPan(e.evt)
  }
  if (intent.kind === 'select') select(intent.id)
}

function handlePointerMove(e?: Konva.KonvaEventObject<PointerEvent>) {
  const stage = stageRef.value?.getStage()
  if (!stage) return
  fillMode.value = heldMode(e?.evt)
  emit('hoverTexture', stage.getRelativePointerPosition())
  pointer.value = stage.getRelativePointerPosition()

  const current = liveStroke.value
  if (!current) return
  const point = stage.getRelativePointerPosition()
  if (!point) return
  liveStroke.value = { ...current, points: [...current.points, point.x, point.y] }
}

function handlePointerLeave() {
  emit('hoverTexture', null)
  pointer.value = null
  fillPreview.value = null
}

function handlePointerUp() {
  const stroke = liveStroke.value
  liveStroke.value = null
  if (!stroke || stroke.points.length < 4) return
  const target = strokeTarget()
  updateLayer(target.id, {
    strokes: [...target.strokes, ...mirrored(stroke)],
  } as Partial<StrokeLayer>)
}

defineExpose({
  stageRef,
  transformerRef,
  previewLayerRef,
  layers,
  liveStroke,
  fillPreview,
  previewConfig,
  config,
  strokeConfigs,
  transformerConfig,
  handleDragMove,
  handleTransform,
  registerNode,
  releaseEdits,
  handlePointerDown,
  handlePointerMove,
  handlePointerLeave,
  handlePointerUp,
  holdEdits,
  getStage: () => stageRef.value?.getStage() ?? null,
})

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Shows what the bucket is aiming at before it is clicked: on a sheet this
/// dense, a seed pixel says nothing about how far the fill will run.
function recomputeFillPreview() {
  const point = pointer.value
  if (tool.value !== 'bucket' || !point) {
    fillPreview.value = null
    return
  }
  fillPreview.value = previewMask(
    point,
    fillTolerance.value,
    fillColor.value,
    props.baseImage,
    fillMode.value,
  )
}

/// Shift turns the bucket from "this colour" into "this panel". Konva hands the
/// native event along with every pointer event, and a synthetic one without it
/// simply holds no modifier.
function heldMode(event: PointerEvent | undefined): FillMode {
  return event?.shiftKey ? 'zone' : 'colour'
}

/// Named as chrome so it is stripped from the flattened sheet: the highlight is
/// something to aim with, never paint.
function previewConfig(mask: BucketMask) {
  return {
    image: mask.canvas,
    x: mask.x,
    y: mask.y,
    name: 'editor-chrome',
    listening: false,
  }
}

function bitmapFor(layer: EditorLayer) {
  if (layer.type === 'image') return { image: resolve(layer.src), origin: undefined }
  if (layer.type !== 'bucket') return { image: null, origin: undefined }

  const mask = maskFor(layer, props.baseImage)
  return { image: mask?.canvas ?? null, origin: mask ?? undefined }
}

function pickAtPointer(stage: Konva.Stage) {
  const point = stage.getRelativePointerPosition()
  if (!point) return
  const hex = pickColor(stage, point.x, point.y)
  if (hex) sampleColor(hex)
}

function fillAtPointer(stage: Konva.Stage, mode: FillMode) {
  const point = stage.getRelativePointerPosition()
  if (!point) return
  addBucketLayer(point, mode)
}

function startStroke(stage: Konva.Stage) {
  const point = stage.getRelativePointerPosition()
  if (!point) return
  liveStroke.value = newStroke([point.x, point.y])
}

function isOnTransformer(node: Konva.Node | null): boolean {
  let current: Konva.Node | null = node
  while (current) {
    if (current.getClassName() === 'Transformer') return true
    current = current.getParent()
  }
  return false
}

/// Tracked on `window` rather than the stage so a pan survives the cursor
/// leaving the canvas, which is most of what panning is for.
function startPan(event: PointerEvent) {
  stopPan?.()
  let last = { x: event.clientX, y: event.clientY }

  function move(ev: PointerEvent) {
    emit('pan', { x: ev.clientX - last.x, y: ev.clientY - last.y })
    last = { x: ev.clientX, y: ev.clientY }
  }

  function up() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    stopPan = null
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  stopPan = up
}
</script>

<template>
  <v-stage
    ref="stageRef"
    :config="{
      width: props.width,
      height: props.height,
      scaleX: props.scale,
      scaleY: props.scale,
      x: props.position.x,
      y: props.position.y,
    }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointerleave="handlePointerLeave"
  >
    <v-layer>
      <v-image
        v-if="props.baseImage"
        :config="{ image: props.baseImage, name: 'editor-base', listening: false }"
      />

      <template v-for="layer in layers" :key="layer.id">
        <template v-if="layer.visible">
          <v-image
            v-if="layer.type === 'image'"
            :ref="(el) => registerNode(layer.id, el)"
            :config="config(layer)"
            @dragstart="holdEdits"
            @dragmove="handleDragMove($event, layer)"
            @dragend="releaseEdits"
            @transformstart="holdEdits"
            @transform="handleTransform($event, layer)"
            @transformend="releaseEdits"
          />
          <v-text-path
            v-else-if="layer.type === 'text' && layer.curve !== 0"
            :ref="(el) => registerNode(layer.id, el)"
            :config="config(layer)"
            @dragstart="holdEdits"
            @dragmove="handleDragMove($event, layer)"
            @dragend="releaseEdits"
            @transformstart="holdEdits"
            @transform="handleTransform($event, layer)"
            @transformend="releaseEdits"
          />
          <v-text
            v-else-if="layer.type === 'text'"
            :ref="(el) => registerNode(layer.id, el)"
            :config="config(layer)"
            @dragstart="holdEdits"
            @dragmove="handleDragMove($event, layer)"
            @dragend="releaseEdits"
            @transformstart="holdEdits"
            @transform="handleTransform($event, layer)"
            @transformend="releaseEdits"
          />
          <v-rect
            v-else-if="layer.type === 'shape' && layer.shape === 'rect'"
            :ref="(el) => registerNode(layer.id, el)"
            :config="config(layer)"
            @dragstart="holdEdits"
            @dragmove="handleDragMove($event, layer)"
            @dragend="releaseEdits"
            @transformstart="holdEdits"
            @transform="handleTransform($event, layer)"
            @transformend="releaseEdits"
          />
          <v-ellipse
            v-else-if="layer.type === 'shape'"
            :ref="(el) => registerNode(layer.id, el)"
            :config="config(layer)"
            @dragstart="holdEdits"
            @dragmove="handleDragMove($event, layer)"
            @dragend="releaseEdits"
            @transformstart="holdEdits"
            @transform="handleTransform($event, layer)"
            @transformend="releaseEdits"
          />
          <v-image v-else-if="layer.type === 'bucket'" :config="config(layer)" />
          <v-line
            v-for="stroke in layer.type === 'strokes' ? strokeConfigs(layer) : []"
            :key="stroke.key"
            :config="stroke"
          />
        </template>
      </template>

      <v-image
        v-if="props.uvTemplate"
        :config="{
          image: props.uvTemplate,
          width: props.textureWidth,
          height: props.textureHeight,
          opacity: props.uvOpacity,
          name: 'editor-chrome',
          listening: false,
        }"
      />

      <v-circle
        v-if="props.hoverPoint"
        :config="{
          x: props.hoverPoint.x,
          y: props.hoverPoint.y,
          radius: 14 / props.scale,
          stroke: '#38bdf8',
          strokeWidth: 3 / props.scale,
          name: 'editor-chrome',
          listening: false,
        }"
      />

      <v-line v-if="liveStroke" :config="strokeConfigs({ strokes: [liveStroke], opacity: 1 })[0]" />
      <v-transformer ref="transformerRef" :config="transformerConfig" />
    </v-layer>

    <v-layer v-if="fillPreview" ref="previewLayerRef" :config="{ listening: false }">
      <v-image :config="previewConfig(fillPreview)" />
    </v-layer>
  </v-stage>
</template>
