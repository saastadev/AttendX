import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server"
import { getEmployee360Profile, AuthorizationError } from "@/lib/employee360/aggregator"

// GET /api/employee-360 (E360-TC-001 through E360-TC-007)
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
      return NextResponse.json({ error: "Unauthorized session" }, { status: 401 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Resolve roles & tenant strictly server-side (Rule 2)
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id)

    if (!roles || roles.length === 0) {
      return NextResponse.json({ error: "No organization membership resolved" }, { status: 403 })
    }

    const tenantId = roles[0].tenant_id
    const roleList = roles.map(r => r.role)

    // Optional query param: target employee ID (defaults to self)
    const targetEmployeeId = req.nextUrl.searchParams.get("employeeId") || user.id

    const profile = await getEmployee360Profile(
      tenantId,
      targetEmployeeId,
      user.id,
      roleList
    )

    return NextResponse.json({
      success: true,
      profile,
    })
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    console.error("[Employee 360 API Error]:", err)
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 })
  }
}
