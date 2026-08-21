'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import { OfflineSyncProvider } from '@/hooks/useOfflineSync'
import { ToastContainer } from '@/components/ui/Toast'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: 2 minutes — data stays fresh without refetch
            staleTime: 2 * 60 * 1000,
            // Cache time: 10 minutes — data kept in memory after component unmounts
            gcTime: 10 * 60 * 1000,
            // Retry once on failure
            retry: 1,
            // Don't refetch on window focus for HR app (high-frequency workflows)
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Show error state on mutation failure — no silent fallback
            onError: (error) => {
              console.error('[Mutation Error]', error)
            },
          },
        },
      })
  )

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope)
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err.message)
          })
      } else {
        // In development: unregister service workers and clear cache to avoid stale Turbopack chunk hydration
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister()
          }
        })
        if ('caches' in window) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name)
            }
          })
        }
      }
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OfflineSyncProvider>
            <ToastContainer>{children}</ToastContainer>
          </OfflineSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
