import { computed, ref, shallowRef, toRaw } from 'vue'

const HISTORY_LIMIT = 50

/// History of whole snapshots rather than reversible operations: a livery document
/// is a few kilobytes of JSON with images held by path, so cloning it is cheaper
/// than maintaining an inverse for every edit.
export function useUndoStack<T>(read: () => T, write: (snapshot: T) => void) {
  const past = shallowRef<T[]>([])
  const future = shallowRef<T[]>([])
  const pending = ref<T | null>(null)
  const holding = ref(false)

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  /// Call before mutating. Repeated calls without an intervening mutation collapse
  /// into one entry, so a drag that fires continuously stays a single undo step.
  function begin() {
    if (pending.value !== null) return
    pending.value = snapshot(read())
  }

  function commit() {
    if (holding.value || pending.value === null) return
    past.value = [...past.value, pending.value].slice(-HISTORY_LIMIT)
    future.value = []
    pending.value = null
  }

  function undo() {
    const previous = past.value[past.value.length - 1]
    if (previous === undefined) return
    future.value = [snapshot(read()), ...future.value]
    past.value = past.value.slice(0, -1)
    write(previous)
  }

  function redo() {
    const next = future.value[0]
    if (next === undefined) return
    past.value = [...past.value, snapshot(read())].slice(-HISTORY_LIMIT)
    future.value = future.value.slice(1)
    write(next)
  }

  /// Holds the current entry open across many mutations, so a drag or a brush
  /// stroke lands as one undo step no matter how many events it fires.
  function hold() {
    begin()
    holding.value = true
  }

  function release() {
    holding.value = false
    commit()
  }

  function clear() {
    past.value = []
    future.value = []
    pending.value = null
    holding.value = false
  }

  return { canUndo, canRedo, begin, commit, hold, release, undo, redo, clear }
}

// ------------------------------------------------------------------------------
// MARK: HELPERS
// ------------------------------------------------------------------------------

/// Reactive proxies cannot be structurally cloned, so unwrap before copying.
function snapshot<T>(value: T): T {
  return structuredClone(toRaw(value))
}
