/** @type {import('next').NextConfig} */

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https:;
  font-src 'self' https://fonts.gstatic.com data:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  connect-src 'self' data: blob: https://api.openai.com https://*.supabase.co wss://*.supabase.co;
`.replace(/\s{2,}/g, ' ').trim()

const nextConfig = {
  turbopack: {},

  // Always define this flag at build time. Turbopack only inlines NEXT_PUBLIC_*
  // values that are SET; an unset one is left as a runtime process.env lookup,
  // so the gated demo-credentials panel (and the seed password inside it) was
  // still shipped in production bundles. Pinning it to a literal lets the
  // compiler fold `'false' === 'true'` and drop the panel entirely.
  env: {
    NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS:
      process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === 'true' ? 'true' : 'false',
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    return [
      ...(isProd ? [{
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      }] : []),
      {
        // Apply security headers to all pages/routes EXCEPT Next.js static assets & images
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
        ],
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
