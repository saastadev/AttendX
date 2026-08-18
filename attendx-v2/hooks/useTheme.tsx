'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark'
type Contrast = 'normal' | 'high'

interface ThemeContextValue {
  theme: Theme
  contrast: Contrast
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  toggleContrast: () => void
  reduceMotion: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [contrast, setContrast] = useState<Contrast>('normal')
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    // Load saved preferences
    const savedTheme = (localStorage.getItem('attendx-theme') as Theme) || 'light'
    const savedContrast = (localStorage.getItem('attendx-contrast') as Contrast) || 'normal'

    // Respect OS dark mode preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const effectiveTheme = savedTheme || (prefersDark ? 'dark' : 'light')

    // Respect OS reduce-motion preference
    const prefersReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReduceMotion(prefersReduceMotion)

    applyTheme(effectiveTheme, savedContrast)
    setThemeState(effectiveTheme)
    setContrast(savedContrast)

    // Listen for OS preference changes
    const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)')
    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleDarkChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('attendx-theme')) {
        applyTheme(e.matches ? 'dark' : 'light', contrast)
        setThemeState(e.matches ? 'dark' : 'light')
      }
    }

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setReduceMotion(e.matches)
    }

    darkModeMedia.addEventListener('change', handleDarkChange)
    motionMedia.addEventListener('change', handleMotionChange)

    return () => {
      darkModeMedia.removeEventListener('change', handleDarkChange)
      motionMedia.removeEventListener('change', handleMotionChange)
    }
  }, [])

  const applyTheme = (t: Theme, c: Contrast) => {
    document.documentElement.setAttribute('data-theme', t)
    document.documentElement.setAttribute('data-contrast', c)
  }

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('attendx-theme', newTheme)
    applyTheme(newTheme, contrast)
  }, [contrast])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, setTheme])

  const toggleContrast = useCallback(() => {
    const newContrast = contrast === 'normal' ? 'high' : 'normal'
    setContrast(newContrast)
    localStorage.setItem('attendx-contrast', newContrast)
    applyTheme(theme, newContrast)
  }, [theme, contrast])

  return (
    <ThemeContext.Provider value={{
      theme,
      contrast,
      toggleTheme,
      setTheme,
      toggleContrast,
      reduceMotion,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
