import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useUndoStack } from './useUndoStack'

function setup(initial: string[] = []) {
  const state = ref<string[]>(initial)
  const stack = useUndoStack(
    () => state.value,
    (snapshot) => {
      state.value = snapshot
    },
  )
  return { state, stack }
}

describe('useUndoStack', () => {
  it('starts with nothing to undo or redo', () => {
    const { stack } = setup()
    expect(stack.canUndo.value).toBe(false)
    expect(stack.canRedo.value).toBe(false)
  })

  it('restores the snapshot taken before the change', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    state.value = ['a', 'b']
    stack.commit()

    stack.undo()
    expect(state.value).toEqual(['a'])
  })

  it('replays an undone change', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    state.value = ['a', 'b']
    stack.commit()
    stack.undo()

    stack.redo()
    expect(state.value).toEqual(['a', 'b'])
  })

  it('collapses repeated begins into one entry so a drag is one step', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    state.value = ['a', 'b']
    stack.begin()
    state.value = ['a', 'b', 'c']
    stack.commit()

    stack.undo()
    expect(state.value).toEqual(['a'])
    expect(stack.canUndo.value).toBe(false)
  })

  /// Every property field holds on focus and releases on blur: tabbing across
  /// the panel must not leave a trail of identical snapshots to undo through.
  it('spends no entry on a begin and commit that changed nothing', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    stack.commit()
    stack.hold()
    stack.release()

    expect(stack.canUndo.value).toBe(false)

    stack.begin()
    state.value = ['a', 'b']
    stack.commit()
    stack.undo()
    expect(state.value).toEqual(['a'])
  })

  it('ignores a commit that follows no begin', () => {
    const { stack } = setup(['a'])
    stack.commit()
    expect(stack.canUndo.value).toBe(false)
  })

  it('drops the redo branch once a new change lands', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    state.value = ['a', 'b']
    stack.commit()
    stack.undo()
    expect(stack.canRedo.value).toBe(true)

    stack.begin()
    state.value = ['a', 'z']
    stack.commit()
    expect(stack.canRedo.value).toBe(false)
  })

  it('does nothing when undoing or redoing past the ends', () => {
    const { state, stack } = setup(['a'])
    stack.undo()
    stack.redo()
    expect(state.value).toEqual(['a'])
  })

  it('keeps at most fifty entries', () => {
    const { state, stack } = setup([])
    for (let i = 0; i < 60; i += 1) {
      stack.begin()
      state.value = [...state.value, String(i)]
      stack.commit()
    }
    for (let i = 0; i < 60; i += 1) stack.undo()

    // The ten oldest snapshots fell off, so the earliest reachable state has ten entries.
    expect(state.value).toHaveLength(10)
  })

  it('keeps a held entry open across many changes', () => {
    const { state, stack } = setup(['a'])
    stack.hold()
    stack.begin()
    state.value = ['a', 'b']
    stack.commit()
    stack.begin()
    state.value = ['a', 'b', 'c']
    stack.commit()
    stack.release()

    stack.undo()
    expect(state.value).toEqual(['a'])
    expect(stack.canUndo.value).toBe(false)
  })

  it('forgets its history when cleared', () => {
    const { state, stack } = setup(['a'])
    stack.begin()
    state.value = ['a', 'b']
    stack.commit()

    stack.clear()
    expect(stack.canUndo.value).toBe(false)
    expect(stack.canRedo.value).toBe(false)
  })
})
