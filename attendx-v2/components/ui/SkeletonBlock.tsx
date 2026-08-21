'use client'

interface SkeletonBlockProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  style?: React.CSSProperties
}

export function SkeletonBlock({
  width = '100%',
  height = 20,
  borderRadius = 'var(--radius-md)',
  className = '',
  style = {},
}: SkeletonBlockProps) {
  return (
    <div
      className={`neu-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  )
}
