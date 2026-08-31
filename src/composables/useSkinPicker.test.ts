import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import type { SkinEntry } from '@/types/index'
import { useSkinPicker } from './useSkinPicker'

async function withSetup<T>(composable: () => T): Promise<{ result: T; unmount: () => void }> {
  let result!: T
  const App = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div/>',
  })
  const wrapper = mount(App)
  await flushPromises()
  return { result, unmount: () => wrapper.unmount() }
}

function makeSkin(overrides: Partial<SkinEntry> = {}): SkinEntry {
  return {
    name: 'red_01',
    path: '/ac/content/cars/ferrari/skins/red_01',
    textureCount: 3,
    ...overrides,
  }
}

const CAR_PATH = '/ac/content/cars/ferrari'

beforeEach(() => {
  clearInvokeHandlers()
})

afterEach(async () => {
  // Module-level state is shared — reset it so each test starts clean.
  const { result } = await withSetup(() => useSkinPicker())
  result.close()
  result.skins.value = []
  result.error.value = ''
})

describe('useSkinPicker', () => {
  it('starts closed with no skins', async () => {
    const { result } = await withSetup(() => useSkinPicker())
    expect(result.isOpen.value).toBe(false)
    expect(result.skins.value).toEqual([])
  })

  it('opens and loads the skins of the given car', async () => {
    const skins = [makeSkin(), makeSkin({ name: 'blue_02' })]
    mockInvokeHandler('list_car_skins', () => skins)

    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    expect(result.isOpen.value).toBe(true)
    expect(result.isLoading.value).toBe(false)
    expect(result.carPath.value).toBe(CAR_PATH)
    expect(result.carName.value).toBe('Ferrari 488')
    expect(result.skins.value).toEqual(skins)
    expect(result.error.value).toBe('')
  })

  it('passes the car path to the backend command', async () => {
    let received: unknown = null
    mockInvokeHandler('list_car_skins', (args: unknown) => {
      received = args
      return []
    })

    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    expect(received).toEqual({ carPath: CAR_PATH })
  })

  it('reports an error when the car has no skins', async () => {
    mockInvokeHandler('list_car_skins', () => [])

    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    expect(result.error.value).toBe('This car has no skins folder.')
    expect(result.isOpen.value).toBe(true)
  })

  it('surfaces backend failures and stops loading', async () => {
    mockInvokeHandler('list_car_skins', () => {
      throw new Error('Cannot read skins folder')
    })

    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    expect(result.error.value).toBe('Cannot read skins folder')
    expect(result.isLoading.value).toBe(false)
    expect(result.skins.value).toEqual([])
  })

  it('clears the previous car state when reopening', async () => {
    mockInvokeHandler('list_car_skins', () => [makeSkin()])
    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    mockInvokeHandler('list_car_skins', () => {
      throw new Error('boom')
    })
    await result.openForCar('/ac/content/cars/porsche', 'Porsche 911')

    expect(result.carName.value).toBe('Porsche 911')
    expect(result.skins.value).toEqual([])
    expect(result.error.value).toBe('boom')
  })

  it('close hides the dialog but keeps the loaded car', async () => {
    mockInvokeHandler('list_car_skins', () => [makeSkin()])
    const { result } = await withSetup(() => useSkinPicker())
    await result.openForCar(CAR_PATH, 'Ferrari 488')

    result.close()

    expect(result.isOpen.value).toBe(false)
    expect(result.carPath.value).toBe(CAR_PATH)
  })
})
