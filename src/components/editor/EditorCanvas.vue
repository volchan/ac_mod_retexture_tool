<script setup lang="ts">
import type Konva from 'konva'
import { ref, shallowRef, watch } from 'vue'
import { useBucketMasks } from '@/composables/useBucketMasks'
import { useEditorTools } from '@/composables/useEditorTools'
import { useImageAssets } from '@/composables/useImageAssets'
import { useLiveryDocument } from '@/composables/useLiveryDocument'
import { layerConfig, strokeConfigs, transformerConfig } from '@/lib/editorConfig'
import { pointerIntent } from '@/lib/editorPointer'
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
const { tool, strokeTarget, newStroke, addBucketLayer, mirrored } = useEditorTools()
const { maskFor } = useBucketMasks()
const { resolve } = useImageAssets()

const stageRef = ref<{ getStage: () => Konva.Stage } | null>(null)
const transformerRef = ref<{ getNode: () => Konva.Transformer } | null>(null)
const liveStroke = shallowRef<BrushStroke | null>(null)

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

function config(layer: EditorLayer) {
  return layerConfig(layer, {
    image: bitmapFor(layer),
    textureWidth: props.textureWidth,
    textureHeight: props.textureHeight,
    interactive: tool.value === 'select',
  })
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
  if (intent.kind === 'fill') fillAtPointer(stage)
  if (intent.kind === 'pan') {
    select(null)
    startPan(e.evt)
  }
  if (intent.kind === 'select') select(intent.id)
}

function handlePointerMove() {
  const stage = stageRef.value?.getStage()
  if (!stage) return
  emit('hoverTexture', stage.getRelativePointerPosition())

  const current = liveStroke.value
  if (!current) return
  const point = stage.getRelativePointerPosition()
  if (!point) return
  liveStroke.value = { ...current, points: [...current.points, point.x, point.y] }
}

function handlePointerLeave() {
  emit('hoverTexture', null)
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
  layers,
  liveStroke,
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

function bitmapFor(layer: EditorLayer) {
  if (layer.type === 'image') return resolve(layer.src)
  if (layer.type === 'bucket') return maskFor(layer, props.baseImage)
  return null
}

function fillAtPointer(stage: Konva.Stage) {
  const point = stage.getRelativePointerPosition()
  if (!point) return
  addBucketLayer(point)
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

function startPan(event: PointerEvent) {
  let last = { x: event.clientX, y: event.clientY }

  function move(ev: PointerEvent) {
    emit('pan', { x: ev.clientX - last.x, y: ev.clientY - last.y })
    last = { x: ev.clientX, y: ev.clientY }
  }

  function up() {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
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
      <v-image v-if="props.baseImage" :config="{ image: props.baseImage, listening: false }" />

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
  </v-stage>
</template>
