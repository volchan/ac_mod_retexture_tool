import { beforeEach, describe, expect, it, vi } from 'vitest'
import { twoPanels } from '@/test-fixtures/mesh'
import type { Texture } from '@/types/index'

vi.mock('@/lib/tauri', () => ({ getCarMesh: vi.fn(async () => twoPanels()) }))

import { getCarMesh } from '@/lib/tauri'
import { useCarPreview } from './useCarPreview'

const texture = { name: 'Chassis.png' } as Texture

describe('useCarPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCarPreview().reset()
  })

  /// The bucket fills panels as the model lays them out, 3D view or not.
  it('reads the model without showing the car', async () => {
    const preview = useCarPreview()

    await preview.ensureMesh(texture, '/cars/furiano')

    expect(getCarMesh).toHaveBeenCalledWith('/cars/furiano', 'Chassis.png')
    expect(preview.mesh.value).not.toBeNull()
    expect(preview.isEnabled.value).toBe(false)
  })

  /// Reading a model walks the whole KN5, and the 3D view and the bucket both ask.
  it('reads the model once for everyone who asks', async () => {
    const preview = useCarPreview()

    await Promise.all([
      preview.ensureMesh(texture, '/cars/furiano'),
      preview.ensureMesh(texture, '/cars/furiano'),
    ])
    await preview.toggle(texture, '/cars/furiano')

    expect(getCarMesh).toHaveBeenCalledOnce()
    expect(preview.isEnabled.value).toBe(true)
  })

  it('reads nothing when the view is switched off', async () => {
    const preview = useCarPreview()
    preview.isEnabled.value = true

    await preview.toggle(texture, '/cars/furiano')

    expect(getCarMesh).not.toHaveBeenCalled()
  })

  it('says why the model could not be read and switches the view off', async () => {
    vi.mocked(getCarMesh).mockRejectedValueOnce(new Error('no kn5 in this folder'))
    const preview = useCarPreview()

    await preview.toggle(texture, '/cars/furiano')

    expect(preview.error.value).toBe('no kn5 in this folder')
    expect(preview.isEnabled.value).toBe(false)
    expect(preview.isLoading.value).toBe(false)
  })

  /// A model read for the last car must not land on the next one.
  it('drops a reply that arrives after a reset', async () => {
    let answer: (mesh: ReturnType<typeof twoPanels>) => void = () => {}
    vi.mocked(getCarMesh).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const preview = useCarPreview()

    const pending = preview.ensureMesh(texture, '/cars/furiano')
    preview.reset()
    answer(twoPanels())
    await pending

    expect(preview.mesh.value).toBeNull()
  })
})
