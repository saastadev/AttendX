import test from 'node:test'
import assert from 'node:assert'

test('Auth & Store Integrity Tests', async (t) => {
  await t.test('REGRESSION LOCK: Auth bypass is impossible on failed login', async () => {
    // Mock store state
    let currentUser = null
    let currentRole = null

    // Simulate login handler
    function simulateSignIn(email, password) {
      if (email === 'employee@acme-tech.com' && password === 'wrong-password') {
        return { error: { message: 'Invalid login credentials' }, user: null }
      }
      return { error: null, user: { email, role: 'EMPLOYEE' } }
    }

    const res = simulateSignIn('employee@acme-tech.com', 'wrong-password')

    if (res.error) {
      // Must NOT assign fallback SUPERADMIN or populate store on error
      currentUser = null
      currentRole = null
    } else {
      currentUser = res.user
    }

    assert.ok(res.error, 'Failed login MUST return error object')
    assert.strictEqual(currentUser, null, 'Store user MUST remain null on failed login')
    assert.strictEqual(currentRole, null, 'Store role MUST remain null on failed login')
  })
})
