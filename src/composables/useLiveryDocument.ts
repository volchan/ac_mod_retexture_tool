import { computed, ref, shallowRef } from 'vue'
import { useUndoStack } from '@/composables/useUndoStack'
import type { EditorLayer, LiveryDocument, Texture } from '@/types/index'

const document = shallowRef<LiveryDocument | null>(null)
const selectedId = ref<string | null>(null)

const history = useUndoStack(
  () => document.value?.layers ?? [],
  (layers) => {
    if (document.value) document.value = { ...document.value, layers }
    if (!layers.some((l) => l.id === selectedId.value)) selectedId.value = null
  },
)

/// The layer stack for the texture currently open in the editor. Index 0 is the
/// bottom of the stack, directly above the base texture.
export function useLiveryDocument() {
  const layers = computed<EditorLayer[]>(() => document.value?.layers ?? [])

  const selectedLayer = computed<EditorLayer | null>(
    () => layers.value.find((l) => l.id === selectedId.value) ?? null,
  )

  function init(texture: Texture, restored?: LiveryDocument) {
    document.value = restored ?? {
      textureId: texture.id,
      width: texture.width,
      height: texture.height,
      layers: [],
    }
    selectedId.value = null
    history.clear()
  }

  function reset() {
    document.value = null
    selectedId.value = null
    history.clear()
  }

  function addLayer(layer: EditorLayer) {
    edit((current) => [...current, layer])
    selectedId.value = layer.id
  }

  function removeLayer(id: string) {
    edit((current) => current.filter((l) => l.id !== id))
    if (selectedId.value === id) selectedId.value = null
  }

  /// `delta` moves the layer through the stack: +1 towards the viewer.
  function moveLayer(id: string, delta: number) {
    edit((current) => {
      const from = current.findIndex((l) => l.id === id)
      const to = from + delta
      if (from === -1 || to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function updateLayer(id: string, patch: Partial<EditorLayer>) {
    edit((current) => current.map((l) => (l.id === id ? ({ ...l, ...patch } as EditorLayer) : l)))
  }

  /// Held edits let a drag or a brush stroke land as one undo entry instead of one
  /// per pointer event: hold, mutate freely, then release.
  function holdEdits() {
    history.hold()
  }

  function releaseEdits() {
    history.release()
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  return {
    document,
    layers,
    selectedId,
    selectedLayer,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    init,
    reset,
    addLayer,
    removeLayer,
    moveLayer,
    updateLayer,
    holdEdits,
    releaseEdits,
    undo: history.undo,
    redo: history.redo,
    select,
  }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

function edit(transform: (layers: EditorLayer[]) => EditorLayer[]) {
  const current = document.value
  if (!current) return

  // A transform with nothing to do hands the same array back — moving the top
  // layer up, say. Committing that spends an undo entry on a change the user
  // cannot see, and they have to press undo twice to reach the last real one.
  const next = transform(current.layers)
  if (next === current.layers) return

  history.begin()
  document.value = { ...current, layers: next }
  history.commit()
}

export function createLayerId() {
  return crypto.randomUUID()
}
