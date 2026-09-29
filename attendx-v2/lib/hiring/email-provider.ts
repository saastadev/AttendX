// ============================================================
// AttendX v2 — Hiring Module: Pluggable Email & Messaging Providers
// Supports SMTP/SendGrid, WhatsApp/SMS stubs, and calendar attachments
// ============================================================

export interface EmailAttachment {
  filename: string
  content: string // Base64 or utf8 string
  contentType: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
  from?: string
  attachments?: EmailAttachment[]
}

export interface SendEmailResult {
  success: boolean
  messageId: string
  status: 'SENT' | 'DELIVERED' | 'FAILED'
  error?: string
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>
}

// ------------------------------------------------------------
// Adapter: SendGrid / SMTP Provider (Stub)
// ------------------------------------------------------------
export class SendGridEmailProvider implements EmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    // TODO(provider: sendgrid): Integrate @sendgrid/mail or nodemailer SMTP transport.
    // Env vars: process.env.SENDGRID_API_KEY or process.env.SMTP_HOST
    const messageId = `msg_sg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    // Stub delivery simulation
    return {
      success: true,
      messageId,
      status: 'DELIVERED',
    }
  }
}

// ------------------------------------------------------------
// Adapter: Mock Provider for Unit Tests
// ------------------------------------------------------------
export class MockEmailProvider implements EmailProvider {
  public sentMessages: SendEmailOptions[] = []

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    this.sentMessages.push(options)
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      status: 'DELIVERED',
    }
  }
}

// ------------------------------------------------------------
// Messaging: WhatsApp / SMS Provider (Stub)
// ------------------------------------------------------------
export interface SendSmsOptions {
  to: string
  message: string
}

export interface SmsProvider {
  sendSms(options: SendSmsOptions): Promise<{ success: boolean; messageId: string }>
}

export class TwilioWhatsAppSmsProvider implements SmsProvider {
  async sendSms(options: SendSmsOptions): Promise<{ success: boolean; messageId: string }> {
    // TODO(provider: twilio): Call Twilio REST API for WhatsApp/SMS dispatch.
    return {
      success: true,
      messageId: `tw_${Date.now()}`,
    }
  }
}

// ------------------------------------------------------------
// Factory
// ------------------------------------------------------------
export class EmailProviderFactory {
  private static instance: EmailProvider | null = null

  static getProvider(): EmailProvider {
    if (!this.instance) {
      this.instance = new SendGridEmailProvider()
    }
    return this.instance
  }

  static setProvider(provider: EmailProvider): void {
    this.instance = provider
  }
}
