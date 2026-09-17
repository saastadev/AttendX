// ============================================================
// AttendX v2 — AI Sentiment Analysis Engine (Scope Feature 1)
// Specs: AIS-TC-003 through AIS-TC-010
// ============================================================

export interface PIIResult {
  scrubbedText: string
  piiDetected: boolean
  redactedTypes: string[]
}

export interface SentimentResult {
  score: number // Range: -1.000 to +1.000
  label: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED"
  classification?: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED"
  confidence: number
  hasEmojis: boolean
  hasSarcasm: boolean
}

export interface SentimentAggregates {
  moraleIndex: number // 0.00 to 100.00
  engagementScore: number // 0.00 to 100.00
  cultureHealthScore: number // 0.00 to 100.00
  retentionRiskScore: number // 0.00 to 100.00
  positiveCount: number
  negativeCount: number
  neutralCount: number
  mixedCount: number
  totalResponses: number
}

// 1. PII REDACTION ENGINE (AIS-TC-009)
export function scrubPII(text: string): PIIResult {
  if (!text) return { scrubbedText: "", piiDetected: false, redactedTypes: [] }

  const types: string[] = []
  let scrubbed = text

  // SSN pattern (e.g. 123-45-6789)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g
  if (ssnRegex.test(scrubbed)) {
    types.push("SSN")
    scrubbed = scrubbed.replace(ssnRegex, "[REDACTED_SSN]")
  }

  // Credit Card pattern (e.g. 4532-1234-5678-9012 or 16 consecutive digits)
  const ccRegex = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g
  if (ccRegex.test(scrubbed)) {
    types.push("CREDIT_CARD")
    scrubbed = scrubbed.replace(ccRegex, "[REDACTED_CC]")
  }

  // Phone number pattern (North American & International formats)
  const phoneRegex = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g
  if (phoneRegex.test(scrubbed)) {
    types.push("PHONE")
    scrubbed = scrubbed.replace(phoneRegex, "[REDACTED_PHONE]")
  }

  // Email address pattern
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  if (emailRegex.test(scrubbed)) {
    types.push("EMAIL")
    scrubbed = scrubbed.replace(emailRegex, "[REDACTED_EMAIL]")
  }

  return {
    scrubbedText: scrubbed,
    piiDetected: types.length > 0,
    redactedTypes: types,
  }
}

// 2. EMOJI SENTIMENT LEXICON (AIS-TC-006)
const EMOJI_WEIGHTS: Record<string, number> = {
  "😊": 0.7, "😃": 0.8, "🎉": 0.8, "👍": 0.6, "❤️": 0.9, "🔥": 0.7, "✨": 0.7,
  "🙌": 0.7, "💪": 0.6, "🤩": 0.9, "👏": 0.7, "🚀": 0.8, "💯": 0.8, "⭐": 0.7,
  "😞": -0.7, "😢": -0.8, "😡": -0.9, "👎": -0.7, "💔": -0.8, "💀": -0.6,
  "😤": -0.7, "🤮": -0.9, "😠": -0.8, "🤬": -1.0, "🙄": -0.5, "😴": -0.4,
}

// 3. LEXICON & VALENCE SHIFTERS
const POSITIVE_WORDS = new Set([
  "great", "excellent", "amazing", "wonderful", "outstanding", "superb", "happy",
  "supportive", "helpful", "productive", "collaborative", "inspiring", "love",
  "appreciated", "rewarding", "transparent", "innovative", "thriving", "fantastic",
  "balanced", "flexible", "motivated", "growth", "empowering", "enjoy", "respect"
])

const NEGATIVE_WORDS = new Set([
  "terrible", "horrible", "awful", "toxic", "burnout", "overworked", "stressed",
  "unsupported", "frustrated", "unfair", "micromanaged", "ignored", "hated",
  "disorganized", "chaotic", "exhausted", "poor", "hostile", "disappointed",
  "underpaid", "lack", "failing", "leaving", "quit", "bad", "depressed", "dread"
])

const NEGATION_WORDS = new Set([
  "not", "never", "no", "hardly", "barely", "scarcely", "seldom", "neither", "without"
])

const SARCASM_PATTERNS = [
  /oh\s+great/i,
  /oh\s+sure/i,
  /just\s+what\s+i\s+needed/i,
  /yeah\s+right/i,
  /couldn\x27t\s+be\s+better\s*\.\.\./i,
  /as\s+if/i,
  /what\s+a\s+surprise/i,
  /best\s+thing\s+ever\s*\/s/i,
]

// 4. SENTIMENT INFERENCE PIPELINE (AIS-TC-005, AIS-TC-006)
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || !text.trim()) {
    return { score: 0, label: "NEUTRAL", confidence: 0, hasEmojis: false, hasSarcasm: false }
  }

  const cleanText = text.toLowerCase()
  let hasEmojis = false
  let emojiSum = 0
  let emojiCount = 0

  for (const [emoji, weight] of Object.entries(EMOJI_WEIGHTS)) {
    if (text.includes(emoji)) {
      hasEmojis = true
      emojiSum += weight
      emojiCount++
    }
  }

  // Sarcasm detection heuristic
  const hasSarcasm = SARCASM_PATTERNS.some(p => p.test(text))

  // Tokenize words
  const words = cleanText.match(/[a-z\x27]+/g) || []
  let posPoints = 0
  let negPoints = 0
  let isNegated = false

  for (let i = 0; i < words.length; i++) {
    const w = words[i]

    if (NEGATION_WORDS.has(w)) {
      isNegated = !isNegated
      continue
    }

    if (POSITIVE_WORDS.has(w)) {
      if (isNegated) {
        negPoints += 1.0
      } else {
        posPoints += 1.0
      }
      isNegated = false
    } else if (NEGATIVE_WORDS.has(w)) {
      if (isNegated) {
        posPoints += 0.8
      } else {
        negPoints += 1.0
      }
      isNegated = false
    }
  }

  // Sarcasm flips positive phrasing to negative
  if (hasSarcasm) {
    if (posPoints > 0) {
      negPoints += posPoints * 1.5
      posPoints = 0
    } else {
      negPoints += 1.0
    }
  }

  // Merge text + emoji signals
  let rawScore = 0
  const totalSignals = posPoints + negPoints + emojiCount

  if (totalSignals === 0) {
    rawScore = 0
  } else {
    const textNet = posPoints - negPoints
    const combined = textNet + emojiSum
    rawScore = combined / (totalSignals + 1)
  }

  // If sarcasm detected, invert false positive valence
  if (hasSarcasm && rawScore > 0) {
    rawScore = -Math.abs(rawScore)
  }

  // Strictly clamp to [-1.000, 1.000]
  const normalizedScore = Math.max(-1.0, Math.min(1.0, Math.round(rawScore * 1000) / 1000))

  // Determine classification label
  let label: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED" = "NEUTRAL"

  if (posPoints >= 1.5 && negPoints >= 1.5) {
    label = "MIXED"
  } else if (normalizedScore > 0.15) {
    label = "POSITIVE"
  } else if (normalizedScore < -0.15) {
    label = "NEGATIVE"
  } else {
    label = "NEUTRAL"
  }

  const confidence = Math.min(1.0, Math.max(0.4, totalSignals / (words.length + 1) * 2))

  return {
    score: normalizedScore,
    label,
    classification: label,
    confidence: Math.round(confidence * 100) / 100,
    hasEmojis,
    hasSarcasm,
  }
}

export function validateFeedbackPayload(text: string): { valid: boolean; error?: string } {
  if (!text || !text.trim()) {
    throw new Error("Empty or whitespace-only feedback payload is rejected.")
  }
  if (text.length > 5000) {
    throw new Error("Feedback payload exceeds maximum allowed length of 5000 characters.")
  }
  return { valid: true }
}

// 5. AGGREGATE METRICS ENGINE (AIS-TC-003, AIS-TC-004)
export function calculateAggregateMetrics(
  feedbacks: Array<{ sentiment_score: number; sentiment_label: string; feedback_type?: string }>
): SentimentAggregates {
  if (!feedbacks || feedbacks.length === 0) {
    return {
      moraleIndex: 50.00,
      engagementScore: 50.00,
      cultureHealthScore: 50.00,
      retentionRiskScore: 20.00,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      mixedCount: 0,
      totalResponses: 0,
    }
  }

  let pos = 0
  let neg = 0
  let neu = 0
  let mix = 0
  let scoreSum = 0
  let exitNegCount = 0
  let totalExit = 0

  for (const fb of feedbacks) {
    scoreSum += Number(fb.sentiment_score)
    if (fb.sentiment_label === "POSITIVE") pos++
    else if (fb.sentiment_label === "NEGATIVE") neg++
    else if (fb.sentiment_label === "MIXED") mix++
    else neu++

    if (fb.feedback_type === "EXIT_INTERVIEW") {
      totalExit++
      if (Number(fb.sentiment_score) < -0.15) exitNegCount++
    }
  }

  const total = feedbacks.length
  const avgScore = scoreSum / total

  // Morale Index: maps [-1.0, 1.0] to [0, 100]
  const moraleIndex = Math.round(((avgScore + 1) / 2) * 100 * 100) / 100

  // Engagement Score: proportion of active constructive responses
  const constructiveRatio = (pos + neu * 0.5 + mix * 0.5) / total
  const engagementScore = Math.round(Math.min(100, Math.max(0, constructiveRatio * 100)) * 100) / 100

  // Culture Health Score: weighted combination of morale and non-negative ratio
  const nonNegRatio = (pos + neu) / total
  const cultureHealthScore = Math.round((moraleIndex * 0.6 + nonNegRatio * 100 * 0.4) * 100) / 100

  // Retention Risk Score: high if negative ratio or negative exit interviews are high
  const negRatio = (neg + mix * 0.5) / total
  const exitFactor = totalExit > 0 ? (exitNegCount / totalExit) * 40 : 0
  const retentionRiskScore = Math.round(Math.min(100, Math.max(5, (negRatio * 60) + exitFactor + (100 - moraleIndex) * 0.2)) * 100) / 100

  return {
    moraleIndex: Math.min(100, Math.max(0, moraleIndex)),
    engagementScore: Math.min(100, Math.max(0, engagementScore)),
    cultureHealthScore: Math.min(100, Math.max(0, cultureHealthScore)),
    retentionRiskScore: Math.min(100, Math.max(0, retentionRiskScore)),
    positiveCount: pos,
    negativeCount: neg,
    neutralCount: neu,
    mixedCount: mix,
    totalResponses: total,
  }
}

export function scrubPii(text: string): string {
  return scrubPII(text).scrubbedText
}

export function calculateWorkforceAnalytics(feedbacks: Array<{ score: number; label?: string }>): SentimentAggregates {
  return calculateAggregateMetrics(
    feedbacks.map((f) => ({
      sentiment_score: f.score,
      sentiment_label: f.label || (f.score > 0.05 ? "POSITIVE" : f.score < -0.05 ? "NEGATIVE" : "NEUTRAL"),
    }))
  )
}

export function enforceDepartmentIsolation<T extends { department: string }>(records: T[], department: string): T[] {
  return records.filter((r) => r.department?.toLowerCase() === department.toLowerCase())
}

export function classifySentimentScore(score: number): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (score > 0.05) return "POSITIVE"
  if (score < -0.05) return "NEGATIVE"
  return "NEUTRAL"
}
