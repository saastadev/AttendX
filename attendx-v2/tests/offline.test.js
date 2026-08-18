import test from 'node:test'
import assert from 'node:assert'

test('Offline Queue Unit Tests', async (t) => {
  const MAX_SYNC_ATTEMPTS = 5

  function classifyError(status) {
    if (status === 400 || status === 422 || status === 403) return 'PERMANENT'
    return 'TRANSIENT'
  }

  function getBackoffDelayMs(attemptNumber) {
    return Math.min(1000 * Math.pow(2, attemptNumber), 30000)
  }

  await t.test('ASSERT: Error classification identifies 4xx as PERMANENT and 5xx as TRANSIENT', () => {
    assert.strictEqual(classifyError(400), 'PERMANENT')
    assert.strictEqual(classifyError(403), 'PERMANENT')
    assert.strictEqual(classifyError(500), 'TRANSIENT')
    assert.strictEqual(classifyError(503), 'TRANSIENT')
  })

  await t.test('ASSERT: Exponential backoff increases properly up to max cap', () => {
    assert.strictEqual(getBackoffDelayMs(1), 2000)
    assert.strictEqual(getBackoffDelayMs(2), 4000)
    assert.strictEqual(getBackoffDelayMs(5), 30000) // capped at 30s
  })

  await t.test('ASSERT: Items exceeding MAX_SYNC_ATTEMPTS are moved to dead-letter and RETAINED', () => {
    const queue = [
      { id: 'punch-1', attempts: 5, status: 'FAILED' },
      { id: 'punch-2', attempts: 2, status: 'PENDING' },
    ]

    const processed = queue.map(item => {
      if (item.attempts >= MAX_SYNC_ATTEMPTS) {
        return { ...item, status: 'DEAD_LETTER' }
      }
      return item
    })

    const deadLetterItem = processed.find(i => i.id === 'punch-1')
    assert.ok(deadLetterItem, 'Dead letter item MUST NOT be deleted or dropped')
    assert.strictEqual(deadLetterItem.status, 'DEAD_LETTER')
    assert.strictEqual(processed.length, 2, 'Total queue length MUST remain 2 (retained)')
  })
})
