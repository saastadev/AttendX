'use client'

import { useEffect, useState } from 'react'

interface AnimatedValueProps {
  value: number | string
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
  formatter = (v) => Math.round(v).toString(),
}: AnimatedValueProps) {
  const numericValue = typeof value === 'number' ? value : parseFloat(value)
  const isNumeric = !isNaN(numericValue)

  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value)

  useEffect(() => {
    if (!isNumeric) {
      setDisplayValue(value)
      return
    }

    let startTimestamp: number | null = null
    const startVal = 0
    const endVal = numericValue

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      const current = startVal + progress * (endVal - startVal)
      setDisplayValue(current)

      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }

    window.requestAnimationFrame(step)
  }, [value, duration, isNumeric, numericValue])

  return (
    <span className={`num ${className}`} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {isNumeric && typeof displayValue === 'number' ? formatter(displayValue) : displayValue}
    </span>
  )
}
