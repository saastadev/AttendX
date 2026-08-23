'use client'

import { motion } from 'framer-motion'
import { PAGE_TRANSITION } from './MotionConfig'

interface PageWrapperProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  id?: string
}

export function PageWrapper({ children, className = '', style, id }: PageWrapperProps) {
  return (
    <motion.div
      id={id}
      style={style}
      className={`page-wrapper ${className}`}
      {...PAGE_TRANSITION}
    >
      {children}
    </motion.div>
  )
}
