import test from 'node:test'
import assert from 'node:assert/strict'
import { isTableMissingError, SourcingService } from '../lib/hiring/sourcing-service.ts'

test('Sourcing Resilience Suite', async (t) => {
  await t.test('1. isTableMissingError detects PGRST205 and schema cache errors', () => {
    assert.equal(isTableMissingError({ code: 'PGRST205', message: "Could not find the table 'public.sourced_candidates' in the schema cache" }), true)
    assert.equal(isTableMissingError({ message: 'relation "public.sourced_candidates" does not exist' }), true)
    assert.equal(isTableMissingError({ message: 'table public.sourced_candidates does not exist' }), true)
    assert.equal(isTableMissingError(new Error("Could not find the table 'public.sourced_candidates' in the schema cache")), true)
    assert.equal(isTableMissingError({ code: '23505', message: 'duplicate key value violates unique constraint' }), false)
    assert.equal(isTableMissingError(null), false)
  })

  await t.test('2. SourcingService.executeSearch falls back to in-memory persistence when table missing from schema cache', async () => {
    // Mock Supabase client where sourced_candidates table is missing in schema cache (Render environment condition)
    const mockClient = {
      from(tableName) {
        if (tableName === 'sourcing_searches') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: 'PGRST205', message: "Could not find the table 'public.sourcing_searches' in the schema cache" }
                })
              })
            }),
            update: () => ({
              eq: async () => ({ data: null, error: null })
            })
          }
        }
        if (tableName === 'sourced_candidates') {
          return {
            insert: () => ({
              select: async () => ({
                data: null,
                error: { code: 'PGRST205', message: "Could not find the table 'public.sourced_candidates' in the schema cache" }
              })
            })
          }
        }
        if (tableName === 'job_requisitions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: null, error: { code: 'PGRST205', message: "table missing" } })
                })
              })
            })
          }
        }
        return {
          select: () => ({ eq: () => ({}) })
        }
      }
    }

    const orgId = '11111111-0000-0000-0000-000000000001'
    const userId = 'u1000000-0000-0000-0000-000000000001'

    // Should NOT throw Error: Failed to persist sourced candidates: Could not find the table...
    const result = await SourcingService.executeSearch(mockClient, orgId, userId, {
      roleTitle: 'Full Stack Engineer',
      skills: ['React', 'Node.js'],
      platforms: ['LINKEDIN'],
    })

    assert.ok(result, 'executeSearch returned a result')
    assert.ok(result.candidates.length > 0, 'Found mock candidates')
    assert.equal(result.search.status, 'COMPLETED')
    // Ensure memorySourcedCandidates stored them
    const firstCandidate = result.candidates[0]
    assert.ok(firstCandidate.id, 'Candidate was assigned an ID')
    assert.ok(SourcingService.memorySourcedCandidates.has(firstCandidate.id), 'Candidate stored in memory fallback')
  })
})
