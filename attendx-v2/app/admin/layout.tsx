import AppShell from '@/components/layout/AppShell'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AttendX — Admin',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
