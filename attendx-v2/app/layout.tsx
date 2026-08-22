import type { Metadata, Viewport } from 'next'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import './styles/design-system.css'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})


export const metadata: Metadata = {
  title: {
    default: 'AttendX — AI-Powered HR & Attendance',
    template: '%s | AttendX',
  },
  description: 'Modern AI-enabled workforce management. Clock in, manage leave, track performance, and collaborate — all in one place.',
  keywords: ['HR', 'attendance', 'workforce management', 'leave management', 'performance review'],
  authors: [{ name: 'AttendX' }],
  creator: 'AttendX',
  publisher: 'AttendX',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AttendX',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'AttendX',
    title: 'AttendX — AI-Powered HR & Attendance',
    description: 'Modern AI-enabled workforce management platform.',
  },
  robots: {
    index: false, // HR app — don't index
    follow: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#6C63FF',
  width: 'device-width',
  initialScale: 1,
  // maximumScale/userScalable intentionally omitted — WCAG 2.2 AA requires pinch-zoom
  viewportFit: 'cover', // For iPhone notch safe-area
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
