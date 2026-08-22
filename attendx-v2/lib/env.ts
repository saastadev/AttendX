import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL').optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required').optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    return null
  }

  if (url.includes('placeholder.supabase.co') || anonKey.includes('placeholder')) {
    return null
  }

  return { url, anonKey }
}

export function validateEnv() {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NODE_ENV: process.env.NODE_ENV ?? 'development',
  })

  const isProduction = (process.env.NODE_ENV ?? 'development') === 'production'
  if (!parsed.success && isProduction) {
    const issues = parsed.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    console.error(`❌ [ENV ERROR] Invalid or missing environment variables:\n${issues}`)
  }

  // In local development, missing Supabase credentials are allowed to fall back to a no-auth mode.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (url.includes('placeholder.supabase.co')) {
    console.warn(
      `⚠️ [ENV WARNING] NEXT_PUBLIC_SUPABASE_URL is set to a placeholder string ("${url}"). ` +
      `Local no-auth mode is active.`
    )
  }

  return parsed.data
}

export const env = validateEnv()
