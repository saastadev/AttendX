import { useState, useEffect } from 'react'

/**
 * Returns `scrolled: true` when the page has scrolled past `threshold` pixels.
 * Use to trigger compressed/elevated header state.
 */
export function useScrollHeader(threshold = 12): { scrolled: boolean } {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > threshold)
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [threshold])

  return { scrolled }
}
