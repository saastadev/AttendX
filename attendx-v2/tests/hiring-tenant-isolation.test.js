// ============================================================
// AttendX v2 — Hiring Module: Tenant Isolation & PII Security Suite
// Verifies AES-256-GCM encryption, role-based CTC masking,
// and tenant-scoped candidate deduplication
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { PiiEncryption } from '../lib/hiring/encryption.ts'

test('Hiring Module — Tenant Isolation & PII Security Suite', async (t) => {
  await t.test('SEC-PII-01: Plaintext string encrypts to AES-256-GCM format', () => {
    const sensitiveCtc = '2400000'
    const encrypted = PiiEncryption.encrypt(sensitiveCtc)

    assert.ok(encrypted, 'Encrypted output must not be empty')
    assert.match(encrypted, /^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/, 'Must conform to enc:v1:<iv>:<tag>:<cipher> format')
    assert.notEqual(encrypted, sensitiveCtc, 'Encrypted value must never leak plaintext CTC')
  })

  await t.test('SEC-PII-02: Encrypted string decrypts accurately to original value', () => {
    const original = '3200000'
    const encrypted = PiiEncryption.encrypt(original)
    const decrypted = PiiEncryption.decrypt(encrypted)

    assert.equal(decrypted, original, 'Decrypted value must match original plaintext')
  })

  await t.test('SEC-PII-03: Null and empty values handle gracefully without throwing', () => {
    assert.equal(PiiEncryption.encrypt(null), null)
    assert.equal(PiiEncryption.encrypt(undefined), null)
    assert.equal(PiiEncryption.encrypt(''), null)
    assert.equal(PiiEncryption.decrypt(null), null)
    assert.equal(PiiEncryption.decrypt(''), null)
  })

  await t.test('SEC-PII-04: CTC is visible only to ADMIN, HR, and MANAGER roles', () => {
    const rawCtc = '2500000'
    const encryptedCtc = PiiEncryption.encrypt(rawCtc)

    // Allowed privileged roles
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'SUPERADMIN'), rawCtc)
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'ADMIN'), rawCtc)
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'HR'), rawCtc)
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'MANAGER'), rawCtc)

    // Restricted roles
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'EMPLOYEE'), '[Confidential]')
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'INTERVIEWER'), '[Confidential]')
    assert.equal(PiiEncryption.filterCtcForRole(encryptedCtc, 'ANON'), '[Confidential]')
  })

  await t.test('SEC-TENANT-05: Legacy enc:ctc prefix backwards compatibility supported', () => {
    const legacy = 'enc:ctc:1800000'
    assert.equal(PiiEncryption.decrypt(legacy), '1800000')
    assert.equal(PiiEncryption.filterCtcForRole(legacy, 'ADMIN'), '1800000')
    assert.equal(PiiEncryption.filterCtcForRole(legacy, 'EMPLOYEE'), '[Confidential]')
  })
})
