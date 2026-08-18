import AppShell from '@/components/layout/AppShell'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AttendX',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
