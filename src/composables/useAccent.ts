import { ref, watch } from 'vue'
import { useTheme } from '@/composables/useTheme'
import type { AccentKey } from '@/types/index'

interface AccentTokens {
  base: string
  hover: string
  fg: string
  muted: string
  border: string
  text: string
}

interface AccentDef {
  light: AccentTokens
  dark: AccentTokens
}

const ACCENTS: Record<AccentKey, AccentDef> = {
  cobalt: {
    light: {
      base: '#1e40af',
      hover: '#1e3a8a',
      fg: '#ffffff',
      muted: '#eff6ff',
      border: '#bfdbfe',
      text: '#1e3a8a',
    },
    dark: {
      base: '#60a5fa',
      hover: '#3b82f6',
      fg: '#0a0a0a',
      muted: '#172554',
      border: '#1e3a8a',
      text: '#93c5fd',
    },
  },
  crimson: {
    light: {
      base: '#b91c1c',
      hover: '#991b1b',
      fg: '#ffffff',
      muted: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
    },
    dark: {
      base: '#ef4444',
      hover: '#dc2626',
      fg: '#0a0a0a',
      muted: '#450a0a',
      border: '#7f1d1d',
      text: '#fca5a5',
    },
  },
  papaya: {
    light: {
      base: '#ea580c',
      hover: '#c2410c',
      fg: '#ffffff',
      muted: '#fff7ed',
      border: '#fed7aa',
      text: '#c2410c',
    },
    dark: {
      base: '#fb923c',
      hover: '#f97316',
      fg: '#0a0a0a',
      muted: '#431407',
      border: '#7c2d12',
      text: '#fdba74',
    },
  },
  brg: {
    light: {
      base: '#15803d',
      hover: '#166534',
      fg: '#ffffff',
      muted: '#f0fdf4',
      border: '#bbf7d0',
      text: '#166534',
    },
    dark: {
      base: '#4ade80',
      hover: '#22c55e',
      fg: '#052e16',
      muted: '#14532d',
      border: '#166534',
      text: '#86efac',
    },
  },
}

const STORAGE_KEY = 'ac-accent'

function loadStoredAccent(): AccentKey {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && stored in ACCENTS ? (stored as AccentKey) : 'cobalt'
}

const accent = ref<AccentKey>(loadStoredAccent())

function applyAccentVars(key: AccentKey, isDark: boolean) {
  const tokens = isDark ? ACCENTS[key].dark : ACCENTS[key].light
  const el = document.documentElement
  el.style.setProperty('--primary', tokens.base)
  el.style.setProperty('--primary-foreground', tokens.fg)
  el.style.setProperty('--ring', tokens.base)
  el.style.setProperty('--accent-muted', tokens.muted)
  el.style.setProperty('--accent-border', tokens.border)
  el.style.setProperty('--accent-text', tokens.text)
}

function setAccent(key: AccentKey) {
  accent.value = key
  localStorage.setItem(STORAGE_KEY, key)
  const { theme } = useTheme()
  applyAccentVars(key, theme.value === 'dark')
}

export function useAccent() {
  const { theme } = useTheme()

  watch(theme, (t) => applyAccentVars(accent.value, t === 'dark'), { immediate: true })

  return { accent, setAccent, ACCENTS }
}
