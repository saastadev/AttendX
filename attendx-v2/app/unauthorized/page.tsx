import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Access denied',
}

export default function UnauthorizedPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '28rem' }}>
        <p
          style={{
            fontSize: '0.75rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: 0.6,
            marginBottom: '0.75rem',
          }}
        >
          Error 403
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          You don&apos;t have access to this area
        </h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          This section is limited to specific roles in your organization. If you
          believe you should have access, ask an administrator to review your role.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            padding: '0.7rem 1.4rem',
            borderRadius: '0.6rem',
            background: 'var(--accent, #6C63FF)',
            color: '#fff',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  )
}
