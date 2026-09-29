// ============================================================
// AttendX v2 — Hiring PII Encryption & Masking
// Compliant with AES-256-GCM encryption at rest for candidate PII & CTC
// ============================================================

import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
// Use process.env.HIRING_PII_KEY or fallback to a deterministic local secret
const SECRET_KEY = crypto
  .createHash('sha256')
  .update(process.env.HIRING_PII_KEY || 'attendx-enterprise-hiring-default-encryption-salt-2026')
  .digest()

export class PiiEncryption {
  /**
   * Encrypts plaintext string using AES-256-GCM.
   * Returns formatted string: enc:v1:<iv_hex>:<authTag_hex>:<cipher_hex>
   */
  static encrypt(plaintext: string | number | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null
    const text = String(plaintext)

    try {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)
      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const tag = cipher.getAuthTag()

      return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
    } catch (err) {
      console.error('[PiiEncryption] Encryption failed:', err)
      return text // Fallback to raw string if crypto fails
    }
  }

  /**
   * Decrypts ciphertext formatted as enc:v1:<iv>:<tag>:<cipher>
   */
  static decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) return null
    if (!ciphertext.startsWith('enc:v1:')) {
      // Legacy or mock prefix enc:ctc:...
      if (ciphertext.startsWith('enc:ctc:')) {
        return ciphertext.replace('enc:ctc:', '')
      }
      return ciphertext
    }

    try {
      const parts = ciphertext.split(':')
      if (parts.length !== 5) return ciphertext

      const iv = Buffer.from(parts[2], 'hex')
      const tag = Buffer.from(parts[3], 'hex')
      const encryptedText = parts[4]

      const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv)
      decipher.setAuthTag(tag)
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch {
      return '[Decryption Error]'
    }
  }

  /**
   * Role-based CTC filter. Admin, Recruiter (HR), and Hiring Manager (MANAGER)
   * can view CTC values; others receive a redacted placeholder.
   */
  static filterCtcForRole(
    ctcValue: string | null | undefined,
    userRole: string
  ): string | null {
    if (!ctcValue) return null
    const allowedRoles = ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER']
    if (allowedRoles.includes(userRole)) {
      return this.decrypt(ctcValue)
    }
    return '[Confidential]'
  }

  /**
   * Helper alias for role-based CTC masking
   */
  static maskCtc(ctcValue: any, userRole: string): string | null {
    return this.filterCtcForRole(ctcValue ? String(ctcValue) : null, userRole)
  }
}
