'use client'

import { useEffect, useState } from 'react'

interface AnimatedValueProps {
  value: number | string | null | undefined
  duration?: number
  className?: string
  style?: React.CSSProperties
  formatter?: (val: number) => string
}

export function AnimatedValue({
  value,
  duration = 800,
  className = '',
  style = {},
  formatter = (v) => (isNaN(v) ? '0' : Math.round(v).toString()),
}: AnimatedValueProps) {
  const safeValue = value ?? 0
  const numericValue = typeof safeValue === 'number' ? safeValue : parseFloat(String(safeValue))
  const isNumeric = typeof numericValue === 'number' && !isNaN(numericValue) && isFinite(numericValue)

  const [displayValue, setDisplayValue] = useState<number | string>(isNumeric ? 0 : String(safeValue ?? '0'))

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(String(safeValue ?? '0'))
      return
    }

    let startTimestamp: number | null = null
    const startVal = 0
    const endVal = numericValue

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const current = startVal + progress * (endVal - startVal)
      setDisplayValue(isNaN(current) ? 0 : current)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }

    const rafId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(rafId)
  }, [value, duration, isNumeric, numericValue, safeValue])

  const renderContent = () => {
    if (isNumeric && typeof displayValue === 'number' && !isNaN(displayValue)) {
      try {
        return formatter(displayValue)
      } catch {
        return displayValue.toString()
      }
    }
    if (typeof displayValue === 'number' && isNaN(displayValue)) {
      return '0'
    }
    return String(displayValue ?? '0')
  }

  return (
    <span className={`num ${className}`} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {renderContent()}
    </span>
  )
}
