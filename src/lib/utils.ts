import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function heroLabel(name: string): string {
  if (name === 'preview.png') return 'Loading screen'
  const match = name.match(/^preview_(.+)\.png$/)
  if (match) {
    const layout = match[1].replace(/_/g, ' ')
    return `Loading screen (${layout})`
  }
  return name
}
