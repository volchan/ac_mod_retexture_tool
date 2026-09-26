import { describe, expect, it } from 'vitest'
import type { Texture } from '@/types/index'
import { originalBytes, paintedBytes } from './textureBytes'

const onDisk = { name: 'body.dds', path: '/cars/gtm/skins/blue/body.dds' } as Texture
const inModel = { name: 'body.dds', path: '', kn5File: '/cars/gtm/gtm.kn5' } as Texture
const queued = {
  ...onDisk,
  replacement: { sourcePath: '/edits/body.png', previewUrl: '', width: 1, height: 1 },
}

describe('paintedBytes', () => {
  it('reads what the queue is about to write first', () => {
    expect(paintedBytes(queued)).toEqual({ kind: 'file', path: '/edits/body.png' })
  })

  it('falls back to the texture as the car ships it', () => {
    expect(paintedBytes(onDisk)).toEqual({ kind: 'file', path: '/cars/gtm/skins/blue/body.dds' })
  })

  it('has nothing to read without a texture', () => {
    expect(paintedBytes(null)).toBeNull()
  })
})

describe('originalBytes', () => {
  it('ignores the queue', () => {
    expect(originalBytes(queued)).toEqual({ kind: 'file', path: '/cars/gtm/skins/blue/body.dds' })
  })

  it('reads a texture only the model carries out of the KN5', () => {
    expect(originalBytes(inModel)).toEqual({
      kind: 'embedded',
      kn5: '/cars/gtm/gtm.kn5',
      name: 'body.dds',
    })
  })

  it('has nothing to read for a texture with neither', () => {
    expect(originalBytes({ name: 'x.dds', path: '' } as Texture)).toBeNull()
  })
})
