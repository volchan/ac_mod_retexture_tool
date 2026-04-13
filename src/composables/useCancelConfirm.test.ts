import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { useCancelConfirm } from './useCancelConfirm'

function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div />',
  })
  const wrapper = mount(Comp)
  return { result, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCancelConfirm', () => {
  it('starts with confirming = false', () => {
    const { result } = withSetup(() => useCancelConfirm(() => {}))
    expect(result.confirming.value).toBe(false)
  })

  it('first request() sets confirming = true', async () => {
    const { result } = withSetup(() => useCancelConfirm(() => {}))
    result.request()
    await nextTick()
    expect(result.confirming.value).toBe(true)
  })

  it('second request() calls onConfirm and resets confirming', async () => {
    const onConfirm = vi.fn()
    const { result } = withSetup(() => useCancelConfirm(onConfirm))
    result.request()
    await nextTick()
    result.request()
    await nextTick()
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(result.confirming.value).toBe(false)
  })

  it('auto-resets confirming after 3s', async () => {
    const { result } = withSetup(() => useCancelConfirm(() => {}))
    result.request()
    await nextTick()
    expect(result.confirming.value).toBe(true)
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(result.confirming.value).toBe(false)
  })

  it('reset() clears confirming immediately', async () => {
    const { result } = withSetup(() => useCancelConfirm(() => {}))
    result.request()
    await nextTick()
    result.reset()
    await nextTick()
    expect(result.confirming.value).toBe(false)
  })

  it('reset() prevents onConfirm from being called after timeout cancel', async () => {
    const onConfirm = vi.fn()
    const { result } = withSetup(() => useCancelConfirm(onConfirm))
    result.request()
    await nextTick()
    result.reset()
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(result.confirming.value).toBe(false)
  })

  it('clears timer on unmount', async () => {
    const { result, unmount } = withSetup(() => useCancelConfirm(() => {}))
    result.request()
    await nextTick()
    unmount()
    vi.advanceTimersByTime(3000)
    await nextTick()
    expect(result.confirming.value).toBe(true)
  })
})
