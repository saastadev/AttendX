'use client'

import { useEffect, createContext, useContext, useState, useCallback, useRef } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import type { AuthUser, UserRole } from '@/types/database'

interface AuthContextValue {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  signUp: (email: string, password: string, fullName: string, tenantSlug: string) => Promise<{ error: string | null }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const { setUser, clearUser, setLoading, setInitialized } = useAuthStore()

  const loadUserProfile = useCallback(async (userId: string): Promise<AuthUser | null> => {
    if (!supabase) return null

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/auth/profile', { headers })
      if (res.ok) {
        const json = await res.json()
        if (json.user) return json.user
      }
    } catch (err) {
      console.warn('[Auth] API profile load failed, falling back to direct query:', err)
    }

    // Direct client query fallback using maybeSingle to avoid 406 errors
    const [profileRes, roleRes] = await Promise.all([
      supabase.from('profiles').select('*, tenant:tenants(*)').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role, tenant_id').eq('user_id', userId),
    ])

    const profile = profileRes.data
    const roleRows = roleRes.data ?? []

    if (!profile) {
      console.error('[Auth] Failed to load profile for user', userId)
      return null
    }

    const tenant = profile.tenant as any
    const roleRow = roleRows.find(r => r.tenant_id === profile.tenant_id) ?? { role: 'EMPLOYEE', tenant_id: profile.tenant_id }

    return {
      id: userId,
      email: profile.email,
      profile: {
        id: profile.id,
        tenant_id: profile.tenant_id,
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        phone: profile.phone,
        is_active: profile.is_active,
        face_enrolled: profile.face_enrolled,
        onboarding_completed: profile.onboarding_completed,
        last_seen_at: profile.last_seen_at,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
      },
      role: roleRow.role as UserRole,
      tenant,
    }
  }, [supabase])

  // Apply tenant accent color to CSS custom property
  const applyTenantBranding = useCallback((user: AuthUser | null) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement

    if (user?.tenant?.accent_color) {
      root.style.setProperty('--accent', user.tenant.accent_color)
      // Convert hex to RGB for rgba() usage
      const hex = user.tenant.accent_color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-rgb')
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setInitialized(true)
      return
    }

    // Initial session check
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          const authUser = await loadUserProfile(session.user.id)
          if (authUser) {
            setUser(authUser)
            applyTenantBranding(authUser)
          } else {
            await supabase.auth.signOut()
            clearUser()
          }
        }
      } finally {
        setLoading(false)
        setInitialized(true)
      }
    }

    initAuth()

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const authUser = await loadUserProfile(session.user.id)
          if (authUser) {
            setUser(authUser)
            applyTenantBranding(authUser)
          } else {
            await supabase.auth.signOut()
            clearUser()
          }
        } else if (event === 'SIGNED_OUT') {
          clearUser()
          applyTenantBranding(null)
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Silently refresh without disrupting UX
          const authUser = await loadUserProfile(session.user.id)
          if (authUser) setUser(authUser)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, loadUserProfile, setUser, clearUser, setLoading, setInitialized, applyTenantBranding])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return {
        error: 'Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      }
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      // Surface the real failure. Never fabricate a session: onAuthStateChange
      // is what populates the store on a genuine SIGNED_IN event.
      if (error) return { error: error.message }

      return { error: null }
    } catch (err) {
      console.error('[Auth] signIn transport failure:', err)
      return {
        error: 'Unable to reach the authentication service. Check your connection and try again.',
      }
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [supabase])

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    tenantSlug: string
  ) => {
    if (!supabase) {
      return {
        error: 'Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      }
    }

    // Find tenant by slug first
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('slug', tenantSlug)
      .maybeSingle()

    if (tenantError || !tenant) {
      return { error: 'Organization not found. Check your company code.' }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          tenant_id: tenant.id,
        },
      },
    })

    if (error) return { error: error.message }
    return { error: null }
  }, [supabase])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return {
        error: 'Authentication is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      }
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [supabase])

  return (
    <AuthContext.Provider value={{ signIn, signOut, signUp, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
