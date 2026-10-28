// ============================================================
// AttendX v2 — Hiring Module: Sourcing Provider Factory & Registry
// Phase 4: Pluggable Provider Factory
// Selects between Mock and Future Real implementations via configuration:
//   HIRING_LINKEDIN_PROVIDER=mock (default) | real
//   HIRING_INDEED_PROVIDER=mock (default) | real
// Zero disruption to downstream services or database pipeline
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type SourcingProvider,
  LinkedInMockProvider,
  IndeedMockProvider,
  InternalDbSourcingProvider,
} from './sourcing-provider.ts'

export type SourcingPlatformName = 'linkedin' | 'indeed' | 'internal_db' | string

export class SourcingProviderFactory {
  /**
   * Resolves a sourcing provider instance by platform name.
   * Future real adapters can be swapped in here based on environment configuration.
   */
  static getProvider(
    platform: SourcingPlatformName,
    options?: { client?: SupabaseClient; organizationId?: string }
  ): SourcingProvider {
    const normalized = (platform || '').toLowerCase().trim()

    switch (normalized) {
      case 'linkedin': {
        const mode = (process.env.HIRING_LINKEDIN_PROVIDER || 'mock').toLowerCase()
        if (mode === 'real') {
          // Future real LinkedIn Integration hook:
          // return new LinkedInRealProvider(process.env.LINKEDIN_CLIENT_ID, ...)
          throw new Error('LinkedIn Real API integration is not yet configured. Please set HIRING_LINKEDIN_PROVIDER=mock.')
        }
        return new LinkedInMockProvider()
      }

      case 'indeed': {
        const mode = (process.env.HIRING_INDEED_PROVIDER || 'mock').toLowerCase()
        if (mode === 'real') {
          // Future real Indeed Integration hook:
          // return new IndeedRealProvider(process.env.INDEED_API_KEY, ...)
          throw new Error('Indeed Real API integration is not yet configured. Please set HIRING_INDEED_PROVIDER=mock.')
        }
        return new IndeedMockProvider()
      }

      case 'internal_db':
      case 'internal': {
        if (!options?.client || !options?.organizationId) {
          throw new Error('InternalDbSourcingProvider requires both client and organizationId.')
        }
        return new InternalDbSourcingProvider(options.client, options.organizationId)
      }

      default:
        throw new Error(`Unsupported sourcing platform provider: '${platform}'. Supported platforms: linkedin, indeed, internal_db`)
    }
  }

  /**
   * Returns list of all supported platform identifiers
   */
  static getSupportedPlatforms(): string[] {
    return ['linkedin', 'indeed', 'internal_db']
  }
}

/**
 * Top-level convenience function
 */
export function getSourcingProvider(
  platform: SourcingPlatformName,
  options?: { client?: SupabaseClient; organizationId?: string }
): SourcingProvider {
  return SourcingProviderFactory.getProvider(platform, options)
}
