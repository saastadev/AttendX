'use client'

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Sparkles, Smile, Frown, Meh, ShieldAlert, Heart, Activity,
  Send, Users, CheckCircle2, Lock, Filter
} from "lucide-react"
import { format } from "date-fns"
import { PageWrapper } from "@/components/ui/PageWrapper"
import { useAuthStore } from "@/store/auth.store"
import { useToast } from "@/components/ui/Toast"

export default function SentimentAnalyticsPage() {
  const user = useAuthStore(s => s.user)
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackType, setFeedbackType] = useState("FEEDBACK")
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  // Fetch sentiment metrics
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["sentiment-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/sentiment/analytics")
      if (!res.ok) {
        throw new Error("Failed to load sentiment analytics")
      }
      return res.json()
    },
  })

  // Submit new feedback mutation
  const submitMutation = useMutation({
    mutationFn: async (payload: { content: string; feedback_type: string; is_anonymous: boolean }) => {
      const res = await fetch("/api/sentiment/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || "Submission failed")
      }
      return res.json()
    },
    onSuccess: (data) => {
      success(
        data.piiRedacted
          ? "Feedback submitted! (Sensitive PII was detected and redacted)"
          : "Feedback submitted successfully! 🎉"
      )
      setFeedbackText("")
      setShowSubmitModal(false)
      qc.invalidateQueries({ queryKey: ["sentiment-analytics"] })
    },
    onError: (err: any) => {
      toastError("Failed to submit feedback", err.message)
    },
  })

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = feedbackText.trim()
    if (!trimmed) {
      toastError("Failed to submit feedback", "Content must not be empty or whitespace-only")
      return
    }
    submitMutation.mutate({
      content: trimmed,
      feedback_type: feedbackType,
      is_anonymous: isAnonymous,
    })
  }

  const metrics = analytics?.metrics || {
    moraleIndex: 0,
    engagementScore: 0,
    cultureHealthScore: 0,
    retentionRiskScore: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    mixedCount: 0,
    totalResponses: 0,
  }

  const recent = analytics?.recentFeedbacks || []

  return (
    <PageWrapper style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            AI Sentiment & Workforce Morale
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Continuous pulse analysis, engagement scoring, and cultural health monitoring
          </p>
        </div>
        <button
          onClick={() => setShowSubmitModal(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
            background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8,
            fontWeight: 600, cursor: "pointer", fontSize: 14
          }}
        >
          <Send size={16} /> Submit Pulse Feedback
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>Employee Morale Index</span>
            <Smile size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, color: "var(--text-primary)" }}>
            {isLoading ? "--" : `${metrics.moraleIndex}%`}
          </div>
          <span style={{ fontSize: 12, color: metrics.moraleIndex >= 60 ? "#10B981" : "#EF4444" }}>
            {metrics.moraleIndex >= 60 ? "Positive Sentiment Trend" : "Attention Recommended"}
          </span>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>Engagement Score</span>
            <Activity size={18} color="#3B82F6" />
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, color: "var(--text-primary)" }}>
            {isLoading ? "--" : `${metrics.engagementScore}%`}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Constructive Participation Rate
          </span>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>Culture Health Score</span>
            <Heart size={18} color="#EC4899" />
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, color: "var(--text-primary)" }}>
            {isLoading ? "--" : `${metrics.cultureHealthScore}%`}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Organization Psychological Safety
          </span>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>Retention Risk Index</span>
            <ShieldAlert size={18} color={metrics.retentionRiskScore > 35 ? "#EF4444" : "#10B981"} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, color: "var(--text-primary)" }}>
            {isLoading ? "--" : `${metrics.retentionRiskScore}%`}
          </div>
          <span style={{ fontSize: 12, color: metrics.retentionRiskScore > 35 ? "#EF4444" : "#10B981" }}>
            {metrics.retentionRiskScore > 35 ? "High Attrition Risk" : "Stable Workforce"}
          </span>
        </div>
      </div>

      {/* Breakdown SVG Bar */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: "var(--text-primary)" }}>
          Sentiment Distribution ({metrics.totalResponses} Total Responses)
        </h3>
        <div style={{ height: 20, display: "flex", borderRadius: 10, overflow: "hidden", background: "var(--bg-tertiary)" }}>
          {metrics.totalResponses > 0 ? (
            <>
              <div style={{ width: `${(metrics.positiveCount / metrics.totalResponses) * 100}%`, background: "#10B981" }} title={`Positive: ${metrics.positiveCount}`} />
              <div style={{ width: `${(metrics.neutralCount / metrics.totalResponses) * 100}%`, background: "#9CA3AF" }} title={`Neutral: ${metrics.neutralCount}`} />
              <div style={{ width: `${(metrics.mixedCount / metrics.totalResponses) * 100}%`, background: "#F59E0B" }} title={`Mixed: ${metrics.mixedCount}`} />
              <div style={{ width: `${(metrics.negativeCount / metrics.totalResponses) * 100}%`, background: "#EF4444" }} title={`Negative: ${metrics.negativeCount}`} />
            </>
          ) : (
            <div style={{ width: "100%", background: "var(--border)", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
              No sentiment data available for this period
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 13, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981" }} /> Positive: {metrics.positiveCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#9CA3AF" }} /> Neutral: {metrics.neutralCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#F59E0B" }} /> Mixed: {metrics.mixedCount}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#EF4444" }} /> Negative: {metrics.negativeCount}</span>
        </div>
      </div>

      {/* Feedbacks Stream with PII Protection & Anonymous Badges */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: "var(--text-primary)" }}>
          Recent Pulse Feedback (PII Redacted & Anonymous Protected)
        </h3>
        {recent.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
            No feedback submitted yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recent.map((item: any) => (
              <div
                key={item.id}
                style={{
                  padding: 14, border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--bg-secondary)", display: "flex", flexDirection: "column", gap: 6
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                      background: item.sentiment_label === "POSITIVE" ? "#DCFCE7" : item.sentiment_label === "NEGATIVE" ? "#FEE2E2" : "#F3F4F6",
                      color: item.sentiment_label === "POSITIVE" ? "#166534" : item.sentiment_label === "NEGATIVE" ? "#991B1B" : "#374151"
                    }}>
                      {item.sentiment_label} ({item.sentiment_score.toFixed(2)})
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{item.feedback_type}</span>
                  </div>
                  {item.is_anonymous && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
                      <Lock size={12} /> Anonymous
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 }}>
                  {item.content}
                </p>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {format(new Date(item.created_at), "MMM d, yyyy HH:mm")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSubmitModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10, 12, 24, 0.75)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--neu-bg, #1C2030)",
              borderRadius: 16,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
              border: "1px solid var(--glass-border, rgba(255, 255, 255, 0.1))",
              color: "var(--text-primary, #E4E8F6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-primary, #E4E8F6)" }}>
                Submit Pulse Feedback
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowSubmitModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  background: "var(--neu-bg-deep, #161A28)",
                  color: "var(--text-tertiary, #8890B8)",
                  fontSize: 18,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
            
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-primary, #E4E8F6)" }}>
              Type
            </label>
            <select
              className="input select"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--glass-border, rgba(255, 255, 255, 0.12))",
                background: "var(--neu-bg-deep, #161A28)",
                color: "var(--text-primary, #E4E8F6)",
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              <option value="FEEDBACK" style={{ background: "#161A28", color: "#E4E8F6" }}>General Employee Feedback</option>
              <option value="SURVEY" style={{ background: "#161A28", color: "#E4E8F6" }}>Quarterly Survey Response</option>
              <option value="EXIT_INTERVIEW" style={{ background: "#161A28", color: "#E4E8F6" }}>Exit Interview Notes</option>
              <option value="COMMENT" style={{ background: "#161A28", color: "#E4E8F6" }}>Team Comment</option>
            </select>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-primary, #E4E8F6)" }}>
              Feedback Content
            </label>
            <textarea
              className="input textarea"
              rows={4}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Share constructive feedback... (SSN, credit cards, and phone numbers are automatically redacted)"
              style={{
                width: "100%",
                minHeight: 110,
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--glass-border, rgba(255, 255, 255, 0.12))",
                background: "var(--neu-bg-deep, #161A28)",
                color: "var(--text-primary, #E4E8F6)",
                marginBottom: 16,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <input
                type="checkbox"
                id="anonCheck"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent, #4F46E5)" }}
              />
              <label htmlFor="anonCheck" style={{ fontSize: 13, color: "var(--text-secondary, #8890B8)", cursor: "pointer" }}>
                Submit anonymously (Identity will not be recorded in database)
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--glass-border, rgba(255, 255, 255, 0.15))",
                  background: "var(--neu-bg-deep, #161A28)",
                  color: "var(--text-secondary, #8890B8)",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitMutation.isPending}
                onClick={handleSubmit}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent, #4F46E5)",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
