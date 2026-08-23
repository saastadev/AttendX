import { useState, useEffect } from 'react'

const STORAGE_KEY = 'attendx-theme'

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Reads and writes the `data-theme` attribute on `<html>`.
 * Persists choice to localStorage. Respects prefers-color-scheme for initial value.
 */
export function useDarkMode() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggle = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  const set = (t: 'light' | 'dark') => {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem(STORAGE_KEY, t)
  }

  return { theme, isDark: theme === 'dark', toggle, set }
}
