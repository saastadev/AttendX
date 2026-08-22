'use client'

import { motion } from 'framer-motion'
import { PAGE_TRANSITION } from './MotionConfig'

interface PageWrapperProps {
  children: React.ReactNode
  className?: string
}

export function PageWrapper({ children, className = '' }: PageWrapperProps) {
  return (
    <motion.div
      className={`page-wrapper ${className}`}
      {...PAGE_TRANSITION}
    >
      {children}
    </motion.div>
  )
}
