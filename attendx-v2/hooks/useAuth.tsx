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
    // Fetch profile + role + tenant in one go
    const [profileRes, roleRes] = await Promise.all([
      supabase.from('profiles').select('*, tenant:tenants(*)').eq('id', userId).single(),
      // Not .single(): a user can hold roles in several tenants, and .single()
      // errors on multiple rows -- which previously logged them out entirely.
      supabase.from('user_roles').select('role, tenant_id').eq('user_id', userId),
    ])

    let profile = profileRes.data
    let roleRows = roleRes.data ?? []

    if (!profile) {
      // Fallback: Check if user exists in auth session and create profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user && user.id === userId) {
        const tenantId = (user.user_metadata as any)?.tenant_id
        const fullName = (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || 'User'

        // Fetch target tenant or default
        let targetTenantId = tenantId
        if (!targetTenantId) {
          const { data: t } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
          targetTenantId = t?.id
        }

        if (targetTenantId) {
          await supabase.from('profiles').upsert({
            id: userId,
            tenant_id: targetTenantId,
            email: user.email!,
            full_name: fullName,
            is_active: true,
            onboarding_completed: true,
          })

          await supabase.from('user_roles').upsert({
            user_id: userId,
            tenant_id: targetTenantId,
            role: 'EMPLOYEE',
          })

          // Refetch
          const refetchProfile = await supabase.from('profiles').select('*, tenant:tenants(*)').eq('id', userId).maybeSingle()
          const refetchRole = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', userId)

          profile = refetchProfile.data
          roleRows = refetchRole.data ?? []
        }
      }
    }

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
    // Initial session check
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          const authUser = await loadUserProfile(session.user.id)
          if (authUser) {
            setUser(authUser)
            applyTenantBranding(authUser)
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
    await supabase.auth.signOut()
  }, [supabase])

  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    tenantSlug: string
  ) => {
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
