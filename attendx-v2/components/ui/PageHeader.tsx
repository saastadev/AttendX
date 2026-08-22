'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useScrollHeader } from '@/hooks/useScrollHeader'

interface PageHeaderProps {
  title: string
  onBack?: () => void
  showBack?: boolean
  action?: React.ReactNode
  className?: string
}

export default function PageHeader({
  title,
  onBack,
  showBack = false,
  action,
  className = '',
}: PageHeaderProps) {
  const router = useRouter()
  const { scrolled } = useScrollHeader(8)

  const handleBack = () => {
    if (onBack) onBack()
    else router.back()
  }

  return (
    <header
      className={`neu-mobile-header ${scrolled ? 'neu-mobile-header--scrolled' : ''} ${className}`}
    >
      {showBack && (
        <button
          className="neu-mobile-header-back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      <h1 className="neu-mobile-header-title">{title}</h1>
      {action && (
        <div className="neu-mobile-header-action">
          {action}
        </div>
      )}
    </header>
  )
}
