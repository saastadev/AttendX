'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  LayoutDashboard, Clock, CalendarDays, MessageSquareMore,
  User, Bell, Trophy, FileText, BarChart3, Shield,
  Users, Settings, ChevronRight, WifiOff, RefreshCcw,
  Search, Camera, Sun, Moon, Sparkles, Heart, Briefcase, UserPlus, LogOut,
  Menu, X, MoreHorizontal,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useTheme } from '@/hooks/useTheme'
import { useScrollHeader } from '@/hooks/useScrollHeader'
import { TenantSwitcher } from '@/components/navigation/tenant-switcher'
import { useQuery } from '@tanstack/react-query'
import { NotificationFlyoutPanel } from '@/components/notifications/NotificationFlyoutPanel'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types/database'

/* Alias must be defined before SIDEBAR_NAV uses it */
const BarChart2 = BarChart3

/* ---- Shared spring config (single source of truth for motion. Typed as any to satisfy framer-motion strict Transition) ---- */
export const SPRING_GENTLE: any = { type: 'spring', stiffness: 280, damping: 28 }
export const SPRING_BOUNCY: any = { type: 'spring', stiffness: 400, damping: 22 }
export const SPRING_STIFF:  any = { type: 'spring', stiffness: 600, damping: 35 }

/* ---- Nav items: 4 primary bottom tabs + 5th 'More' tab (parity with task requirements) ---- */
const MOBILE_NAV = [
  { href: '/dashboard',     icon: LayoutDashboard,   label: 'Home',       id: 'mnav-home' },
  { href: '/attendance',    icon: Clock,              label: 'Attendance', id: 'mnav-attendance' },
  { href: '/leave',         icon: CalendarDays,       label: 'Leave',      id: 'mnav-leave' },
  { href: '/notifications', icon: Bell,               label: 'Alerts',     id: 'mnav-alerts' },
]

type NavItem = { href: string; icon: React.ElementType; label: string; id: string; minRole?: UserRole }
type NavGroup = { section?: string; items: NavItem[] }

const SIDEBAR_NAV: NavGroup[] = [
  {
    items: [
      { href: '/dashboard',   icon: LayoutDashboard,  label: 'Dashboard',    id: 'snav-dashboard' },
      { href: '/attendance',  icon: Clock,            label: 'Attendance',   id: 'snav-attendance' },
      { href: '/leave',       icon: CalendarDays,     label: 'Leave',        id: 'snav-leave' },
      { href: '/performance', icon: BarChart3,        label: 'Performance',  id: 'snav-performance' },
      { href: '/employee-360',icon: Sparkles,         label: 'Employee 360°',id: 'snav-employee-360' },
      { href: '/recognition', icon: Trophy,           label: 'Recognition',  id: 'snav-recognition' },
      { href: '/cases',       icon: FileText,         label: 'Cases',        id: 'snav-cases' },
      { href: '/notifications',icon: Bell,            label: 'Notifications',id: 'snav-notifications' },
      { href: '/copilot',     icon: MessageSquareMore,label: 'HR Copilot',   id: 'snav-copilot' },
    ],
  },
  {
    section: 'Team',
    items: [
      { href: '/manager/team',      icon: Users,  label: 'My Team',   id: 'snav-team',      minRole: 'MANAGER' },
      { href: '/manager/approvals', icon: Shield, label: 'Approvals', id: 'snav-approvals', minRole: 'MANAGER' },
    ],
  },
  {
    section: 'HR & Admin',
    items: [
      { href: '/hr/directory', icon: Users,    label: 'Directory', id: 'snav-directory', minRole: 'HR' },
      { href: '/hr/insights',  icon: BarChart2, label: 'Insights',  id: 'snav-insights',  minRole: 'HR' },
      { href: '/hr/sentiment', icon: Heart,     label: 'Sentiment', id: 'snav-sentiment', minRole: 'HR' },
      { href: '/admin/users',  icon: Shield,   label: 'Users',     id: 'snav-users',     minRole: 'ADMIN' },
      { href: '/admin/attendance', icon: Camera, label: 'Selfies', id: 'snav-admin-attendance', minRole: 'ADMIN' },
      { href: '/admin/settings',icon: Settings, label: 'Settings',  id: 'snav-settings',  minRole: 'ADMIN' },
    ],
  },
  {
    section: 'Hiring',
    items: [
      { href: '/hiring',              icon: UserPlus,  label: 'Overview',     id: 'snav-hiring-hub',  minRole: 'MANAGER' },
      { href: '/hiring/applications', icon: Briefcase, label: 'Applications', id: 'snav-hiring-apps', minRole: 'MANAGER' },
      { href: '/hiring/sourcing',     icon: Search,    label: 'AI Sourcing',  id: 'snav-hiring-src',  minRole: 'HR' },
      { href: '/hiring/outreach',     icon: MessageSquareMore, label: 'Outreach', id: 'snav-hiring-reach', minRole: 'HR' },
      { href: '/hiring/interview-status', icon: Clock, label: 'Interviews',   id: 'snav-hiring-int',  minRole: 'MANAGER' },
      { href: '/hiring/onboard',      icon: Shield,    label: 'Onboarding',   id: 'snav-hiring-onb',  minRole: 'HR' },
      { href: '/hiring/analytics',    icon: BarChart2, label: 'Analytics',    id: 'snav-hiring-stat', minRole: 'HR' },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/profile', icon: User, label: 'Profile', id: 'snav-profile' },
      { href: '/profile/sessions', icon: Shield, label: 'Active Sessions', id: 'snav-sessions' },
    ],
  },
]

// BarChart2 alias now declared at top of file

const ROLE_RANK: Record<UserRole, number> = {
  EMPLOYEE: 1, MANAGER: 2, HR: 3, ADMIN: 4, SUPERADMIN: 5,
}
function canSee(userRole: UserRole, minRole?: UserRole) {
  if (!minRole) return true
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}

/* ---- Command Palette ---- */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore(s => s.user)

  const allItems = SIDEBAR_NAV.flatMap(g => g.items)
    .filter(item => !item.minRole || canSee(user?.role ?? 'EMPLOYEE', item.minRole))

  const filtered = query
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : allItems

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
    }
  }, [open])

  const go = useCallback((href: string) => {
    router.push(href)
    onClose()
  }, [router, onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="neu-cmd-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          aria-modal="true"
          role="dialog"
          aria-label="Command palette"
        >
          <motion.div
            className="neu-cmd-modal"
            initial={{ scale: 0.94, opacity: 0, y: -16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: -16 }}
            transition={SPRING_STIFF}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(128,128,180,0.10)' }}>
              <Search size={18} color="var(--text-tertiary)" aria-hidden="true" />
              <input
                ref={inputRef}
                className="neu-cmd-input"
                placeholder="Search pages and actions…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search"
                style={{ flex: 1, padding: 0, borderBottom: 'none', fontSize: '1rem' }}
              />
              <kbd style={{
                padding: '2px 8px', background: 'var(--neu-bg-deep)',
                borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)', boxShadow: 'var(--elev-0)',
              }}>ESC</kbd>
            </div>

            <div className="neu-cmd-results" role="listbox">
              {filtered.length === 0 ? (
                <div className="neu-cmd-empty">No results for "{query}"</div>
              ) : (
                filtered.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.href}
                      className="neu-cmd-result"
                      onClick={() => go(item.href)}
                      role="option"
                      style={{ width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'rgba(var(--accent-rgb), 0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Icon size={16} color="var(--accent)" aria-hidden="true" />
                      </div>
                      <span style={{ flex: 1, fontWeight: 500 }}>{item.label}</span>
                      <ChevronRight size={14} color="var(--text-muted)" aria-hidden="true" />
                    </button>
                  )
                })
              )}
            </div>

            <div style={{
              padding: '8px 20px', borderTop: '1px solid rgba(128,128,180,0.08)',
              display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)',
            }}>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>ESC close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---- Sidebar Nav Item ---- */
function SidebarItem({ item, isActive, badgeCount }: { item: NavItem; isActive: boolean; badgeCount?: number }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      id={item.id}
      className={`neu-sidebar-item ${isActive ? 'neu-sidebar-item--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon size={18} className="neu-sidebar-item-icon" aria-hidden="true" />
      <span style={{ flex: 1, fontSize: '0.875rem' }}>{item.label}</span>
      {Boolean(badgeCount && badgeCount > 0) && (
        <span
          style={{
            background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
            color: 'white',
            fontSize: '0.6875rem',
            fontWeight: 800,
            padding: '1px 7px',
            borderRadius: 10,
            boxShadow: '0 2px 8px rgba(236, 72, 153, 0.4)',
            lineHeight: 1.2,
            marginRight: isActive ? 4 : 0,
          }}
        >
          {badgeCount}
        </span>
      )}
      {isActive && (
        <motion.div layoutId="sidebar-active-pip" transition={SPRING_GENTLE}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent)', flexShrink: 0,
          }}
        />
      )}
    </Link>
  )
}

/* ============================================================
   MAIN APPSHELL
   ============================================================ */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const { isOnline, pendingCount } = useOfflineSync()
  const { theme, toggleTheme } = useTheme()
  const [cmdOpen, setCmdOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [mobileAvatarMenuOpen, setMobileAvatarMenuOpen] = useState(false)
  const { scrolled } = useScrollHeader(12)

  // Auto-close mobile navigation drawer and avatar menu on route change
  useEffect(() => {
    setMobileDrawerOpen(false)
    setMobileAvatarMenuOpen(false)
  }, [pathname])

  // Live unread notification count (throttled to 20s on mobile to reduce polling battery/data cost)
  const { data: unreadNotifCount = 0 } = useQuery<number>({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0
      const supabase = getSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      try {
        const res = await fetch('/api/notifications?filter=unread', {
          headers,
          credentials: 'include',
        })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json.notifications)) return json.notifications.length
        }
      } catch (err) {
        console.warn('[AppShell] notif count check error:', err)
      }

      // Direct fallback to Supabase client
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
        if (!error && count !== null) return count
      } catch (fallbackErr) {
        console.warn('[AppShell] notif fallback error:', fallbackErr)
      }

      return 0
    },
    enabled: !!user,
    refetchInterval: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 20000 : 6000,
  })

  // Session hydration and auth verification
  useEffect(() => {
    let active = true
    if (!user) {
      fetch('/api/auth/me')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!active) return
          if (data?.user) {
            useAuthStore.getState().setUser(data.user)
          } else {
            router.replace('/auth/login')
          }
        })
        .catch(() => {
          if (!active) return
          router.replace('/auth/login')
        })
    }
    return () => { active = false }
  }, [user, router])

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Apply tenant accent color from profile
  useEffect(() => {
    if (user?.tenant?.accent_color) {
      const hex = user.tenant.accent_color.replace('#', '')
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      document.documentElement.style.setProperty('--accent', user.tenant.accent_color)
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`)
      // Derive dark variant (darken by ~15%)
      const factor = 0.85
      const darken = (c: number) => Math.round(c * factor).toString(16).padStart(2, '0')
      document.documentElement.style.setProperty('--accent-dark', `#${darken(r)}${darken(g)}${darken(b)}`)
      document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.28)`)
    }
  }, [user?.tenant?.accent_color])

  if (isLoading || !user) {
    return (
      <div className="loading-screen" aria-label="Loading AttendX…">
        <div style={{
          width: 56, height: 56,
          background: 'var(--brand-gradient)',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--elev-accent)',
          animation: 'float 2.5s ease-in-out infinite',
        }}>
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect x="6" y="4" width="24" height="28" rx="4" fill="white" fillOpacity="0.9"/>
            <rect x="10" y="10" width="10" height="2" rx="1" fill="var(--accent)"/>
            <rect x="10" y="15" width="16" height="2" rx="1" fill="var(--accent)"/>
            <rect x="10" y="20" width="12" height="2" rx="1" fill="var(--accent)"/>
          </svg>
        </div>
        <div className="loading-spinner" aria-hidden="true" />
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Loading your workspace…</p>
        <a
          href="/auth/login"
          style={{
            marginTop: 12,
            fontSize: '0.8125rem',
            color: 'var(--accent)',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Taking a moment? Click here to Sign In
        </a>
      </div>
    )
  }

  const userRole = user.role

  return (
    <LayoutGroup>
      <div className="neu-app-shell">
        {/* Command Palette */}
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

        {/* Flyout Notification Panel */}
        <NotificationFlyoutPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

        {/* ---- Desktop Sidebar ---- */}
        <motion.nav
          className="neu-sidebar desktop-only"
          aria-label="Main navigation"
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={SPRING_GENTLE}
        >
          {/* Logo */}
          <div className="neu-sidebar-logo">
            <div className="neu-sidebar-logo-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                <rect x="6" y="4" width="24" height="28" rx="4" fill="white" fillOpacity="0.9"/>
                <rect x="10" y="10" width="10" height="2" rx="1" fill="var(--accent)"/>
                <rect x="10" y="15" width="16" height="2" rx="1" fill="var(--accent)"/>
                <rect x="10" y="20" width="12" height="2" rx="1" fill="var(--accent)"/>
              </svg>
            </div>
            <div>
              <div className="neu-sidebar-logo-name">{user.tenant?.app_name ?? 'AttendX'}</div>
              <div className="neu-sidebar-logo-role">{user.role}</div>
            </div>
          </div>

          {/* Organization / Tenant Switcher */}
          <div style={{ padding: '0 var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <TenantSwitcher />
          </div>

          {/* Search pill / cmd trigger + Notification Flyout trigger */}
          <div style={{ padding: '0 var(--space-3)', marginBottom: 'var(--space-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Open command palette (⌘K)"
              style={{
                flex: 1, height: 36,
                background: 'var(--neu-bg-deep)',
                border: '1px solid rgba(128,128,180,0.10)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 10px', cursor: 'pointer',
                color: 'var(--text-tertiary)', fontSize: '0.8125rem',
                boxShadow: 'var(--elev-0)',
                transition: 'border-color var(--dur-fast)',
              }}
            >
              <Search size={14} aria-hidden="true" />
              <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
              <kbd style={{
                fontSize: '0.6875rem', fontFamily: 'var(--font-mono)',
                padding: '1px 6px', background: 'var(--neu-bg)',
                borderRadius: 4, boxShadow: 'var(--elev-0)',
              }}>⌘K</kbd>
            </button>

            <button
              onClick={() => setNotifOpen(prev => !prev)}
              aria-label={`Notifications (${unreadNotifCount} unread)`}
              id="btn-sidebar-notif-flyout"
              title="Open notifications panel"
              style={{
                width: 36, height: 36, flexShrink: 0,
                background: notifOpen ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--neu-bg-deep)',
                border: notifOpen ? '1px solid var(--accent)' : '1px solid rgba(128,128,180,0.10)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                color: notifOpen ? 'var(--accent)' : 'var(--text-secondary)',
                boxShadow: 'var(--elev-0)',
                transition: 'all var(--dur-fast)',
              }}
            >
              <Bell size={16} />
              {unreadNotifCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -3,
                    background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                    color: 'white',
                    fontSize: '0.625rem',
                    fontWeight: 800,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    boxShadow: '0 2px 6px rgba(236, 72, 153, 0.5)',
                  }}
                >
                  {unreadNotifCount}
                </span>
              )}
            </button>
          </div>

          {/* Nav sections */}
          {SIDEBAR_NAV.map((group, gi) => (
            <div key={gi} role="group" aria-label={group.section ?? 'Main navigation'}>
              {group.section && (
                <div className="neu-sidebar-section-label">{group.section}</div>
              )}
              {group.items
                .filter(item => canSee(userRole, item.minRole))
                .map(item => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <SidebarItem
                      key={item.href}
                      item={item}
                      isActive={isActive}
                      badgeCount={item.href === '/notifications' ? unreadNotifCount : undefined}
                    />
                  )
                })}
            </div>
          ))}

          {/* Bottom: user + offline status */}
          <div style={{ marginTop: 'auto', padding: 'var(--space-3) var(--space-3) 0' }}>
            {(!isOnline || pendingCount > 0) && (
              <motion.div
                className={`neu-offline-pill ${!isOnline ? 'neu-offline-pill--offline' : 'neu-offline-pill--syncing'}`}
                style={{ marginBottom: 'var(--space-3)', justifyContent: 'center' }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                role="status" aria-live="polite"
              >
                {!isOnline
                  ? <><WifiOff size={12} aria-hidden="true" /> Offline</>
                  : <><RefreshCcw size={12} className="anim-spin" aria-hidden="true" /> {pendingCount} syncing</>
                }
              </motion.div>
            )}

            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-2)',
              background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--elev-0)',
            }}>
              <div
                style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: '0.875rem',
                  fontFamily: 'var(--font-display)',
                }}
                aria-hidden="true"
              >
                {(user.profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.profile?.full_name || user.email?.split('@')[0] || 'User'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  border: 'none', background: 'var(--neu-bg)',
                  boxShadow: 'var(--elev-1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', transition: 'all var(--dur-fast)'
                }}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/auth/logout', { method: 'POST' })
                  } catch {
                    // Ignore network failure on sign out
                  }
                  useAuthStore.getState().clearUser()
                  window.location.href = '/auth/login?switch=true'
                }}
                title="Sign out / Switch user"
                aria-label="Sign out / Switch user"
                style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                  border: 'none', background: 'var(--neu-bg)',
                  boxShadow: 'var(--elev-1)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-secondary)', transition: 'all var(--dur-fast)'
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </motion.nav>

        {/* ---- Main Shell Container (stacks Top Bar + Content) ---- */}
        <div className="neu-shell-main">
          {/* ---- Mobile Top Bar ---- */}
          <header className={`neu-mobile-topbar mobile-only ${scrolled ? 'neu-mobile-topbar--scrolled' : ''}`} aria-label="Mobile application bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="neu-touch-btn"
                aria-label="Open full menu"
                id="btn-mobile-drawer-toggle"
                style={{
                  width: 44, height: 44,
                  background: 'var(--neu-bg-deep)',
                  border: '1px solid rgba(128,128,180,0.12)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--elev-0)',
                  cursor: 'pointer',
                }}
              >
                <Menu size={22} aria-hidden="true" />
              </button>
              <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 'var(--radius-md)',
                  background: 'var(--brand-gradient)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: '0.875rem',
                  boxShadow: 'var(--elev-accent)',
                }}>
                  {(user.tenant?.app_name ?? 'A').charAt(0)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{
                    fontWeight: 800, fontSize: '0.9375rem',
                    color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
                    lineHeight: 1.2
                  }}>
                    {user.tenant?.app_name ?? 'AttendX'}
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {user.role}
                  </span>
                </div>
              </Link>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Command Palette Trigger */}
              <button
                onClick={() => setCmdOpen(true)}
                className="neu-touch-btn"
                aria-label="Search pages (⌘K)"
                id="btn-mobile-cmd-search"
                style={{
                  width: 40, height: 40,
                  background: 'var(--neu-bg-deep)',
                  border: '1px solid rgba(128,128,180,0.12)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  boxShadow: 'var(--elev-0)',
                  cursor: 'pointer',
                }}
              >
                <Search size={18} aria-hidden="true" />
              </button>

              {/* Notification Bell with Flyout Trigger & Unread Count */}
              <button
                onClick={() => setNotifOpen(prev => !prev)}
                className="neu-touch-btn"
                aria-label={`Notifications (${unreadNotifCount} unread)`}
                id="btn-mobile-notif-flyout"
                style={{
                  width: 40, height: 40,
                  background: notifOpen ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--neu-bg-deep)',
                  border: notifOpen ? '1px solid var(--accent)' : '1px solid rgba(128,128,180,0.12)',
                  borderRadius: 'var(--radius-md)',
                  color: notifOpen ? 'var(--accent)' : 'var(--text-secondary)',
                  boxShadow: 'var(--elev-0)',
                  position: 'relative',
                  cursor: 'pointer',
                }}
              >
                <Bell size={18} aria-hidden="true" />
                {unreadNotifCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2, right: -2,
                      background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                      color: 'white',
                      fontSize: '0.5625rem',
                      fontWeight: 800,
                      minWidth: 16, height: 16,
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px',
                      boxShadow: '0 2px 6px rgba(236, 72, 153, 0.5)',
                    }}
                  >
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Profile Avatar Button (opens Avatar Menu) */}
              <button
                onClick={() => setMobileAvatarMenuOpen(prev => !prev)}
                className="neu-touch-btn"
                aria-label="User Account Menu"
                id="btn-mobile-avatar-menu"
                style={{
                  width: 40, height: 40,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
                  border: mobileAvatarMenuOpen ? '2px solid var(--accent)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: '0.875rem',
                  boxShadow: 'var(--elev-1)',
                  cursor: 'pointer',
                }}
              >
                {(user.profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
              </button>
            </div>
          </header>

          {/* Mobile Offline / Sync Status Banner */}
          {(!isOnline || pendingCount > 0) && (
            <div
              className="neu-mobile-sync-strip mobile-only"
              style={{
                padding: '6px var(--space-4)',
                background: !isOnline ? 'var(--danger-light)' : 'var(--warning-light)',
                borderBottom: '1px solid rgba(128,128,180,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: !isOnline ? 'var(--danger)' : 'var(--warning-dark)',
                width: '100%',
              }}
              role="status" aria-live="polite"
            >
              {!isOnline ? (
                <>
                  <WifiOff size={13} aria-hidden="true" />
                  <span>Offline Mode — Changes saved locally</span>
                </>
              ) : (
                <>
                  <RefreshCcw size={13} className="anim-spin" aria-hidden="true" />
                  <span>Syncing {pendingCount} change{pendingCount > 1 ? 's' : ''} to server…</span>
                </>
              )}
            </div>
          )}

          {/* Mobile Avatar Menu Dropdown / Sheet */}
          <AnimatePresence>
            {mobileAvatarMenuOpen && (
              <motion.div
                className="neu-drawer-backdrop mobile-only"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setMobileAvatarMenuOpen(false)}
                style={{ zIndex: 1000 }}
              >
                <motion.div
                  className="neu-card"
                  initial={{ y: -20, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: -20, opacity: 0, scale: 0.95 }}
                  transition={SPRING_GENTLE}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'fixed',
                    top: 'calc(58px + env(safe-area-inset-top, 0px))',
                    right: 12,
                    left: 12,
                    maxWidth: 380,
                    marginLeft: 'auto',
                    background: 'var(--neu-bg-raised)',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--space-4)',
                    boxShadow: 'var(--elev-4)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  {/* User Card */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: '1.125rem',
                      flexShrink: 0,
                    }}>
                      {(user.profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.profile?.full_name || user.email?.split('@')[0] || 'User'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <span className="badge badge-neutral" style={{ fontSize: '0.625rem', padding: '1px 6px' }}>{user.role}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setMobileAvatarMenuOpen(false)}
                      aria-label="Close user menu"
                      className="neu-touch-btn"
                      style={{ width: 36, height: 36, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Organization Switcher inside Avatar Menu */}
                  <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.04em' }}>
                      Switch Organization
                    </div>
                    <TenantSwitcher />
                  </div>

                  {/* Theme Toggle Button */}
                  <button
                    onClick={toggleTheme}
                    className="neu-touch-btn"
                    style={{
                      height: 44, borderRadius: 'var(--radius-md)',
                      background: 'var(--neu-bg)', border: '1px solid var(--border)',
                      boxShadow: 'var(--elev-0)', color: 'var(--text-primary)',
                      fontSize: '0.8125rem', fontWeight: 600, gap: 10, cursor: 'pointer',
                      justifyContent: 'flex-start', padding: '0 14px',
                    }}
                  >
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    <span>{theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}</span>
                  </button>

                  {/* Profile Link */}
                  <Link
                    href="/profile"
                    onClick={() => setMobileAvatarMenuOpen(false)}
                    className="neu-drawer-item"
                    style={{ padding: '10px 14px', minHeight: 44 }}
                  >
                    <User size={16} color="var(--accent)" />
                    <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600 }}>My Profile</span>
                    <ChevronRight size={14} color="var(--text-muted)" />
                  </Link>

                  {/* Sign Out Button */}
                  <button
                    onClick={async () => {
                      try { await fetch('/api/auth/logout', { method: 'POST' }) } catch (err) { console.warn('Logout error', err) }
                      useAuthStore.getState().clearUser()
                      window.location.href = '/auth/login?switch=true'
                    }}
                    className="neu-touch-btn"
                    aria-label="Sign Out"
                    style={{
                      height: 44, borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-light)', border: 'none',
                      color: 'var(--danger)', fontSize: '0.8125rem', fontWeight: 600,
                      gap: 8, cursor: 'pointer', justifyContent: 'center',
                    }}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

        {/* ---- Main Content ---- */}
        <main className="neu-content-area content-area">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={SPRING_GENTLE}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ---- Mobile Navigation Drawer ---- */}
      <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              className="neu-drawer-backdrop mobile-only"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileDrawerOpen(false)}
              aria-modal="true"
              role="dialog"
              aria-label="Navigation drawer"
            >
              <motion.div
                className="neu-drawer-content"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={SPRING_GENTLE}
                onClick={e => e.stopPropagation()}
              >
                {/* Drawer Header */}
                <div className="neu-drawer-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'linear-gradient(135deg, var(--accent), var(--brand-cyan))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 800, fontSize: '1rem',
                      fontFamily: 'var(--font-display)', flexShrink: 0,
                    }}>
                      {(user.profile?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.profile?.full_name || user.email?.split('@')[0] || 'User'}
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        {user.role} · {user.tenant?.name || 'Workspace'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileDrawerOpen(false)}
                    className="neu-touch-btn"
                    aria-label="Close navigation menu"
                    style={{
                      width: 44, height: 44, borderRadius: 'var(--radius-md)',
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Organization Switcher inside Drawer */}
                <div style={{ padding: 'var(--space-3) var(--space-3) 0' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6, letterSpacing: '0.04em' }}>
                    Organization Switcher
                  </div>
                  <TenantSwitcher />
                </div>

                {/* Drawer Navigation Sections (Full 24+ routes parity) */}
                <div className="neu-drawer-scroll">
                  {SIDEBAR_NAV.map((group, gi) => {
                    const visibleItems = group.items.filter(item => canSee(userRole, item.minRole))
                    if (visibleItems.length === 0) return null
                    return (
                      <div key={gi} role="group" aria-label={group.section ?? 'Navigation section'}>
                        {group.section && (
                          <div style={{
                            fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.06em', color: 'var(--text-tertiary)',
                            padding: '6px 8px', marginBottom: 2,
                          }}>
                            {group.section}
                          </div>
                        )}
                        {visibleItems.map(item => {
                          const Icon = item.icon
                          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileDrawerOpen(false)}
                              className={`neu-drawer-item ${isActive ? 'neu-drawer-item--active' : ''}`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <Icon size={19} color={isActive ? 'var(--accent)' : 'var(--text-secondary)'} aria-hidden="true" />
                              <span style={{ flex: 1 }}>{item.label}</span>
                              {item.href === '/notifications' && unreadNotifCount > 0 && (
                                <span style={{
                                  background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                                  color: 'white', fontSize: '0.6875rem', fontWeight: 800,
                                  padding: '1px 7px', borderRadius: 10,
                                }}>
                                  {unreadNotifCount}
                                </span>
                              )}
                              <ChevronRight size={14} color="var(--text-muted)" aria-hidden="true" />
                            </Link>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                {/* Drawer Footer */}
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--neu-bg-deep)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <button
                    onClick={toggleTheme}
                    className="neu-touch-btn"
                    style={{
                      flex: 1, height: 46, borderRadius: 'var(--radius-md)',
                      background: 'var(--neu-bg)', border: '1px solid var(--border)',
                      boxShadow: 'var(--elev-0)', color: 'var(--text-primary)',
                      fontSize: '0.8125rem', fontWeight: 600, gap: 8, cursor: 'pointer',
                    }}
                  >
                    {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                  </button>

                  <button
                    onClick={async () => {
                      try { await fetch('/api/auth/logout', { method: 'POST' }) } catch (err) { console.warn('Logout error', err) }
                      useAuthStore.getState().clearUser()
                      window.location.href = '/auth/login?switch=true'
                    }}
                    className="neu-touch-btn"
                    aria-label="Sign Out"
                    style={{
                      height: 46, padding: '0 16px', borderRadius: 'var(--radius-md)',
                      background: 'var(--danger-light)', border: 'none',
                      color: 'var(--danger)', fontSize: '0.8125rem', fontWeight: 600,
                      gap: 6, cursor: 'pointer',
                    }}
                  >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---- Mobile Bottom Nav ---- */}
        <motion.nav
          className="neu-nav-bottom mobile-only"
          aria-label="Main mobile navigation"
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={SPRING_GENTLE}
        >
          {MOBILE_NAV.map(item => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
            return (
              <Link
                key={item.href}
                href={item.href}
                id={item.id}
                className={`neu-nav-item ${isActive ? 'neu-nav-item--active' : ''}`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <div style={{ position: 'relative' }}>
                  <Icon
                    className="neu-nav-item-icon"
                    aria-hidden="true"
                    size={22}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  {item.href === '/notifications' && unreadNotifCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -3, right: -6,
                        background: 'linear-gradient(135deg, #EC4899, #8B5CF6)',
                        color: 'white',
                        fontSize: '0.5625rem',
                        fontWeight: 800,
                        minWidth: 16, height: 16,
                        borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 3px',
                        boxShadow: '0 2px 6px rgba(236, 72, 153, 0.5)',
                      }}
                    >
                      {unreadNotifCount}
                    </span>
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-dot"
                      style={{
                        position: 'absolute', bottom: -6, left: '50%',
                        transform: 'translateX(-50%)',
                        width: 4, height: 4, borderRadius: '50%',
                        background: 'var(--accent)',
                      }}
                      transition={SPRING_BOUNCY}
                    />
                  )}
                </div>
                <span className="neu-nav-item-label">{item.label}</span>
              </Link>
            )
          })}

          {/* 5th Action: More / All Modules Drawer Button */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            id="mnav-more-trigger"
            className={`neu-nav-item ${mobileDrawerOpen ? 'neu-nav-item--active' : ''}`}
            aria-label="All Modules & Menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div style={{ position: 'relative' }}>
              <MoreHorizontal
                className="neu-nav-item-icon"
                aria-hidden="true"
                size={22}
                strokeWidth={mobileDrawerOpen ? 2.5 : 1.8}
              />
              {unreadNotifCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -2, right: -4,
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: '#EC4899',
                    boxShadow: '0 0 6px rgba(236, 72, 153, 0.8)',
                  }}
                />
              )}
            </div>
            <span className="neu-nav-item-label">More</span>
          </button>
        </motion.nav>

        {/* Mobile Floating Action Button (FAB) for HR Copilot — 1 tap away */}
        {pathname !== '/copilot' && (
          <Link
            href="/copilot"
            className="neu-fab mobile-only"
            id="fab-mobile-copilot"
            aria-label="Ask HR Copilot"
            style={{
              position: 'fixed',
              bottom: 'calc(var(--mobile-nav-height, 72px) + env(safe-area-inset-bottom, 0px) + 16px)',
              right: 16,
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #8B5CF6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 6px 20px rgba(var(--accent-rgb), 0.45)',
              zIndex: 'var(--z-raised)',
              textDecoration: 'none',
            }}
          >
            <Sparkles size={22} />
          </Link>
        )}
      </div>
    </LayoutGroup>
  )
}
