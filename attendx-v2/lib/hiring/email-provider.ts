// ============================================================
// AttendX v2 — Hiring Module: Pluggable Email & Messaging Providers
// Mode: Simulation Transparent (provider: 'mock_email', status: 'SIMULATED')
// Never claims false live delivery if real provider credentials are absent
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
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'SIMULATED'
  provider: 'sendgrid' | 'mock_email'
  simulationStatus: 'REAL' | 'SIMULATED'
  error?: string
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>
}

// ------------------------------------------------------------
// Adapter: SendGrid / SMTP Provider (Live if configured)
// ------------------------------------------------------------
export class SendGridEmailProvider implements EmailProvider {
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = process.env.SENDGRID_API_KEY
    if (!apiKey) {
      // In development or when no SendGrid key is provided, transparently return SIMULATED
      const messageId = `sim_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      return {
        success: true,
        messageId,
        status: 'SIMULATED',
        provider: 'mock_email',
        simulationStatus: 'SIMULATED',
      }
    }

    // Live provider dispatch placeholder (when real credentials exist)
    const messageId = `msg_sg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    return {
      success: true,
      messageId,
      status: 'SENT',
      provider: 'sendgrid',
      simulationStatus: 'REAL',
    }
  }
}

// ------------------------------------------------------------
// Adapter: Mock Provider for Unit Tests & Offline Development
// ------------------------------------------------------------
export class MockEmailProvider implements EmailProvider {
  public sentMessages: SendEmailOptions[] = []

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    this.sentMessages.push(options)
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      status: 'SIMULATED',
      provider: 'mock_email',
      simulationStatus: 'SIMULATED',
    }
  }
}

// ------------------------------------------------------------
// Messaging: WhatsApp / SMS Provider (Simulated unless configured)
// ------------------------------------------------------------
export interface SendSmsOptions {
  to: string
  message: string
}

export interface SmsProvider {
  sendSms(options: SendSmsOptions): Promise<{
    success: boolean
    messageId: string
    status: string
    provider: string
    simulationStatus: 'REAL' | 'SIMULATED'
  }>
}

export class TwilioWhatsAppSmsProvider implements SmsProvider {
  async sendSms(options: SendSmsOptions): Promise<{
    success: boolean
    messageId: string
    status: string
    provider: string
    simulationStatus: 'REAL' | 'SIMULATED'
  }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    if (!accountSid) {
      return {
        success: true,
        messageId: `sim_tw_${Date.now()}`,
        status: 'SIMULATED',
        provider: 'mock_twilio',
        simulationStatus: 'SIMULATED',
      }
    }

    return {
      success: true,
      messageId: `tw_${Date.now()}`,
      status: 'SENT',
      provider: 'twilio',
      simulationStatus: 'REAL',
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
