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
