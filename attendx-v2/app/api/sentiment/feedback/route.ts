import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server"
import { scrubPII, analyzeSentiment, calculateAggregateMetrics } from "@/lib/sentiment/sentiment-analyzer"

// POST /api/sentiment/feedback (AIS-TC-003 to AIS-TC-009)
export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get("Authorization")
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7)
        const serviceClient = getSupabaseServiceClient()
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) {
          user = userData.user
          authErr = null
        }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: "Unauthorized session" }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve tenant server-side (Rule 2)
    const { data: emp } = await serviceClient
      .from("employees")
      .select("id, tenant_id, department_id")
      .eq("id", user.id)
      .maybeSingle()

    const { data: prof } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle()

    const tenantId = emp?.tenant_id || prof?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 403 })
    }

    const body = await req.json()
    const { content, feedback_type = "FEEDBACK", is_anonymous = false, department_id } = body

    // 1. Input Validation (AIS-TC-007)
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Content must not be empty or whitespace-only" }, { status: 400 })
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: "Content exceeds maximum length of 5000 characters" }, { status: 400 })
    }

    const validTypes = ["FEEDBACK", "SURVEY", "EXIT_INTERVIEW", "COMMENT"]
    if (!validTypes.includes(feedback_type)) {
      return NextResponse.json({ error: "Invalid feedback_type" }, { status: 400 })
    }

    // 2. PII Detection & Redaction (AIS-TC-009)
    const piiResult = scrubPII(content)

    // 3. Sentiment Inference & Classification (AIS-TC-005, AIS-TC-006)
    const sentiment = analyzeSentiment(piiResult.scrubbedText)

    // 4. Anonymous De-Identification (AIS-TC-008)
    const targetEmployeeId = is_anonymous ? null : user.id
    const targetDeptId = department_id || emp?.department_id || null

    const feedbackRecord = {
      tenant_id: tenantId,
      employee_id: targetEmployeeId,
      department_id: targetDeptId,
      feedback_type,
      content: piiResult.scrubbedText,
      is_anonymous: !!is_anonymous,
      sentiment_score: sentiment.score,
      sentiment_label: sentiment.label,
      engagement_score: Math.round(((sentiment.score + 1) / 2) * 100 * 100) / 100,
    }

    const { data: inserted, error: insertErr } = await serviceClient
      .from("employee_feedback")
      .insert(feedbackRecord)
      .select()
      .single()

    if (insertErr) {
      console.error("[Sentiment Feedback Insert Error]:", insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // 5. Update/Refresh Analytics Snapshot for current period (AIS-TC-003, AIS-TC-004)
    const now = new Date()
    const currentPeriod = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`

    // Fetch feedbacks for period to recompute snapshot
    const { data: allPeriodFeedbacks } = await serviceClient
      .from("employee_feedback")
      .select("sentiment_score, sentiment_label, feedback_type")
      .eq("tenant_id", tenantId)

    if (allPeriodFeedbacks && allPeriodFeedbacks.length > 0) {
      const agg = calculateAggregateMetrics(allPeriodFeedbacks)
      await serviceClient
        .from("sentiment_analytics_snapshots")
        .upsert({
          tenant_id: tenantId,
          department_id: null,
          period: currentPeriod,
          morale_index: agg.moraleIndex,
          engagement_score: agg.engagementScore,
          culture_health_score: agg.cultureHealthScore,
          retention_risk_score: agg.retentionRiskScore,
          positive_count: agg.positiveCount,
          negative_count: agg.negativeCount,
          neutral_count: agg.neutralCount,
          mixed_count: agg.mixedCount,
          total_responses: agg.totalResponses,
        }, { onConflict: "tenant_id,department_id,period" })
    }

    return NextResponse.json({
      success: true,
      feedbackId: inserted.id,
      sentimentScore: sentiment.score,
      sentimentLabel: sentiment.label,
      piiRedacted: piiResult.piiDetected,
      redactedTypes: piiResult.redactedTypes,
      isAnonymous: !!is_anonymous,
    }, { status: 201 })
  } catch (err: any) {
    console.error("[Sentiment API Error]:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
