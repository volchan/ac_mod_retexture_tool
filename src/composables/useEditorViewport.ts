import { computed, type Ref, ref } from 'vue'

const MIN_SCALE = 0.02
const MAX_SCALE = 8
const ZOOM_STEP = 1.12

/// Textures are far larger than any window, so the stage renders scaled down and
/// the editor works in texture pixels while the user pans a viewport over them.
export function useEditorViewport(
  textureSize: Ref<{ width: number; height: number }>,
  containerSize: Ref<{ width: number; height: number }>,
) {
  const scale = ref(0)
  const offset = ref({ x: 0, y: 0 })

  const fitScale = computed(() => {
    const { width, height } = textureSize.value
    const box = containerSize.value
    if (width === 0 || height === 0 || box.width === 0 || box.height === 0) return 1
    return Math.min(box.width / width, box.height / height)
  })

  const effectiveScale = computed(() => (scale.value === 0 ? fitScale.value : scale.value))

  const stagePosition = computed(() => {
    if (scale.value === 0)
      return centeredOffset(textureSize.value, containerSize.value, fitScale.value)
    return offset.value
  })

  function zoomAt(point: { x: number; y: number }, direction: number) {
    const current = effectiveScale.value
    const next = clamp(direction > 0 ? current * ZOOM_STEP : current / ZOOM_STEP)
    const origin = stagePosition.value
    const texturePoint = { x: (point.x - origin.x) / current, y: (point.y - origin.y) / current }
    offset.value = {
      x: point.x - texturePoint.x * next,
      y: point.y - texturePoint.y * next,
    }
    scale.value = next
  }

  function panBy(delta: { x: number; y: number }) {
    const origin = stagePosition.value
    scale.value = effectiveScale.value
    offset.value = { x: origin.x + delta.x, y: origin.y + delta.y }
  }

  function resetView() {
    scale.value = 0
    offset.value = { x: 0, y: 0 }
  }

  return { effectiveScale, stagePosition, fitScale, zoomAt, panBy, resetView }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function centeredOffset(
  texture: { width: number; height: number },
  container: { width: number; height: number },
  scale: number,
) {
  return {
    x: (container.width - texture.width * scale) / 2,
    y: (container.height - texture.height * scale) / 2,
  }
}

function clamp(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}
