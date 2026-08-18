// ============================================================
// AttendX v2 — Auth Store (Zustand)
// Centralized auth + tenant + role state
// ============================================================

'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser, UserRole, Tenant, Profile } from '@/types/database'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isInitialized: boolean

  // Actions
  setUser: (user: AuthUser | null) => void
  setLoading: (loading: boolean) => void
  setInitialized: (initialized: boolean) => void
  clearUser: () => void

  // Computed helpers
  isAuthenticated: () => boolean
  hasRole: (roles: UserRole[]) => boolean
  canAccess: (minRole: UserRole) => boolean
}

// Role hierarchy for canAccess checks
const ROLE_HIERARCHY: Record<UserRole, number> = {
  EMPLOYEE: 1,
  MANAGER: 2,
  HR: 3,
  ADMIN: 4,
  SUPERADMIN: 5,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: true,
      isInitialized: false,

      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      setInitialized: (isInitialized) => set({ isInitialized }),
      clearUser: () => set({ user: null }),

      isAuthenticated: () => get().user !== null,

      hasRole: (roles: UserRole[]) => {
        const { user } = get()
        if (!user) return false
        return roles.includes(user.role)
      },

      canAccess: (minRole: UserRole) => {
        const { user } = get()
        if (!user) return false
        return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minRole]
      },
    }),
    {
      name: 'attendx-auth',
      storage: createJSONStorage(() => sessionStorage), // Cleared on tab close
      partialize: (state) => ({ user: state.user }),    // Only persist user object
    }
  )
)
