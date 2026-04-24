export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

export const MOD_SYMBOL = isMac ? '⌘' : 'Ctrl+'

export function modKbd(key: string): string {
  return `${MOD_SYMBOL}${key}`
}
