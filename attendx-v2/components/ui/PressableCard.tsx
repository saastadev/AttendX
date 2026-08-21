'use client'

import { motion, HTMLMotionProps } from 'framer-motion'
import { SPRING_GENTLE, PRESS_TAP } from './MotionConfig'

interface PressableCardProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode
  className?: string
  glass?: boolean
  elevated?: boolean
}

export function PressableCard({
  children,
  className = '',
  glass = false,
  elevated = false,
  ...props
}: PressableCardProps) {
  const cardClass = [
    'neu-card',
    'neu-card--interactive',
    glass ? 'neu-card--glass' : '',
    elevated ? 'neu-card--lg' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <motion.div
      className={cardClass}
      whileHover={{ y: -2, transition: SPRING_GENTLE }}
      whileTap={PRESS_TAP}
      {...props}
    >
      {children}
    </motion.div>
  )
}
