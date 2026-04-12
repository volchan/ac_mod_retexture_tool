import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function previewLabel(name: string): string {
  if (name === 'preview.png') return 'Preview image'
  const match = name.match(/^preview_(.+)\.png$/)
  if (match) {
    const layout = match[1].replace(/_/g, ' ')
    return `Preview image (${layout})`
  }
  return name
}
