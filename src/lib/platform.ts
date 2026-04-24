type NavigatorWithUAData = Navigator & { userAgentData?: { platform: string } }

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return ''
  const nav = navigator as NavigatorWithUAData
  return nav.userAgentData?.platform ?? navigator.platform
}

export const isMac = /Mac/i.test(detectPlatform())

export const MOD_SYMBOL = isMac ? '⌘' : 'Ctrl+'

export function modKbd(key: string): string {
  return `${MOD_SYMBOL}${key}`
}
