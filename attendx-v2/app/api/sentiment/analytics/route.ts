import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server"
import { calculateAggregateMetrics } from "@/lib/sentiment/sentiment-analyzer"

// GET /api/sentiment/analytics (AIS-TC-003, AIS-TC-004, AIS-TC-010)
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get("Authorization")
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7)
        const { data: userData } = await getSupabaseServiceClient().auth.getUser(token)
        if (userData?.user) { user = userData.user; authErr = null }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve roles & tenant server-side
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id)

    if (!roles || roles.length === 0) {
      return NextResponse.json({ error: "No active roles found" }, { status: 403 })
    }

    const isHR = roles.some(r => ["HR", "ADMIN", "SUPERADMIN"].includes(r.role))
    const isManager = roles.some(r => r.role === "MANAGER")

    if (!isHR && !isManager) {
      // Regular employees cannot access sentiment analytics dashboard (AIS-TC-010)
      return NextResponse.json({ error: "Forbidden: Analytics access requires Manager or HR role" }, { status: 403 })
    }

    const tenantId = roles[0].tenant_id

    // Departmental Horizontal Isolation (AIS-TC-010)
    let effectiveDepartmentId: string | null = null

    if (isManager && !isHR) {
      // Find manager department
      const { data: emp } = await serviceClient
        .from("employees")
        .select("department_id")
        .eq("id", user.id)
        .maybeSingle()

      if (!emp?.department_id) {
        return NextResponse.json({ error: "Manager department not assigned" }, { status: 403 })
      }
      // Strictly isolate to manager department
      effectiveDepartmentId = emp.department_id
    } else if (isHR) {
      // HR can optionally filter by departmentId
      const searchDept = req.nextUrl.searchParams.get("departmentId")
      if (searchDept) {
        effectiveDepartmentId = searchDept
      }
    }

    // Query feedbacks
    let query = serviceClient
      .from("employee_feedback")
      .select("id, sentiment_score, sentiment_label, feedback_type, content, is_anonymous, created_at, department_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })

    if (effectiveDepartmentId) {
      query = query.eq("department_id", effectiveDepartmentId)
    }

    const { data: feedbacks, error: qErr } = await query

    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 })
    }

    const aggregate = calculateAggregateMetrics(feedbacks || [])

    // De-identify and strip any PII before returning stream
    const sanitizedFeedbacks = (feedbacks || []).slice(0, 50).map(f => ({
      id: f.id,
      feedback_type: f.feedback_type,
      content: f.content,
      sentiment_score: Number(f.sentiment_score),
      sentiment_label: f.sentiment_label,
      is_anonymous: f.is_anonymous,
      created_at: f.created_at,
      department_id: f.department_id,
    }))

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      department_id: effectiveDepartmentId,
      metrics: {
        moraleIndex: aggregate.moraleIndex,
        engagementScore: aggregate.engagementScore,
        cultureHealthScore: aggregate.cultureHealthScore,
        retentionRiskScore: aggregate.retentionRiskScore,
        positiveCount: aggregate.positiveCount,
        negativeCount: aggregate.negativeCount,
        neutralCount: aggregate.neutralCount,
        mixedCount: aggregate.mixedCount,
        totalResponses: aggregate.totalResponses,
      },
      recentFeedbacks: sanitizedFeedbacks,
    })
  } catch (err: any) {
    console.error("[Sentiment Analytics Error]:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
