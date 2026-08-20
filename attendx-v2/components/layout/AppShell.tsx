'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import {
  LayoutDashboard, Clock, CalendarDays, MessageSquareMore,
  User, Bell, Trophy, FileText, BarChart3, Shield,
  Users, Settings, ChevronRight, WifiOff, RefreshCcw,
  Search, Camera,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import type { UserRole } from '@/types/database'

/* Alias must be defined before SIDEBAR_NAV uses it */
const BarChart2 = BarChart3

/* ---- Shared spring config (single source of truth for motion. Typed as any to satisfy framer-motion strict Transition) ---- */
export const SPRING_GENTLE: any = { type: 'spring', stiffness: 280, damping: 28 }
export const SPRING_BOUNCY: any = { type: 'spring', stiffness: 400, damping: 22 }
export const SPRING_STIFF:  any = { type: 'spring', stiffness: 600, damping: 35 }

/* ---- Nav items ---- */
const MOBILE_NAV = [
  { href: '/dashboard',  icon: LayoutDashboard,   label: 'Home',       id: 'mnav-home' },
  { href: '/attendance', icon: Clock,              label: 'Attendance', id: 'mnav-attendance' },
  { href: '/leave',      icon: CalendarDays,       label: 'Leave',      id: 'mnav-leave' },
  { href: '/copilot',    icon: MessageSquareMore,  label: 'Copilot',    id: 'mnav-copilot' },
  { href: '/profile',    icon: User,               label: 'Profile',    id: 'mnav-profile' },
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
      { href: '/admin/users',  icon: Shield,   label: 'Users',     id: 'snav-users',     minRole: 'ADMIN' },
      { href: '/admin/attendance', icon: Camera, label: 'Selfies', id: 'snav-admin-attendance', minRole: 'ADMIN' },
      { href: '/admin/settings',icon: Settings, label: 'Settings',  id: 'snav-settings',  minRole: 'ADMIN' },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/profile', icon: User, label: 'Profile', id: 'snav-profile' },
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
function SidebarItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
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
  const [cmdOpen, setCmdOpen] = useState(false)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!isLoading && !user) router.replace('/auth/login')
  }, [user, isLoading, router])

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
        <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
      </div>
    )
  }

  const userRole = user.role

  return (
    <LayoutGroup>
      <div className="neu-app-shell">
        {/* Command Palette */}
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

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

          {/* Search pill / cmd trigger */}
          <div style={{ padding: '0 var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Open command palette (⌘K)"
              style={{
                width: '100%', height: 36,
                background: 'var(--neu-bg-deep)',
                border: '1px solid rgba(128,128,180,0.10)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 12px', cursor: 'pointer',
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
                  return <SidebarItem key={item.href} item={item} isActive={isActive} />
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
                {user.profile.full_name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.profile.full_name.split(' ')[0]}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              </div>
            </div>
          </div>
        </motion.nav>

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

        {/* ---- Mobile Bottom Nav ---- */}
        <motion.nav
          className="neu-nav-bottom mobile-only"
          aria-label="Main navigation"
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={SPRING_GENTLE}
        >
          {MOBILE_NAV.map(item => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
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
        </motion.nav>
      </div>
    </LayoutGroup>
  )
}
