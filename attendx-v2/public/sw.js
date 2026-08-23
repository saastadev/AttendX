// ============================================================
// AttendX v2 — Turbopack-Compatible PWA Service Worker
// Spec: docs/specs/20_27_infra_hardening_pwa_security_spec.md
// ============================================================

const CACHE_NAME = 'attendx-pwa-v2.0.0'
const STATIC_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/offline.html',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. SECURITY INVARIANT: NEVER intercept or cache authenticated API mutations or third-party SDKs
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('sentry.io')
  ) {
    return // Let browser network engine handle directly
  }

  // 2. Navigation Requests: Network-First with Offline Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        return (await caches.match('/offline.html')) || Response.error()
      })
    )
    return
  }

  // 3. Static Assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networked = fetch(event.request)
        .then((response) => {
          if (response.status === 200 && url.origin === location.origin) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || networked
    })
  )
})
