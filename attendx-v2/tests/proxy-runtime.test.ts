import test from 'node:test'
import assert from 'node:assert'
import { NextRequest } from 'next/server'

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const resetEnv = () => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl

  if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon
}

test('proxy does not crash when Supabase env vars are missing', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const { proxy } = await import('../proxy.ts')
  const request = new NextRequest('http://localhost:3000/dashboard')

  await assert.doesNotReject(async () => {
    const response = await proxy(request)
    assert.equal(response.status, 200)
  })

  resetEnv()
})
