// ============================================================
// AttendX v2 — Employee 360° Aggregator Engine (Scope Feature 2)
// Specs: E360-TC-001 through E360-TC-008
// ============================================================

export interface DimensionMetric {
  dimension: "Attendance" | "Productivity" | "Performance" | "Learning" | "Recognition"
  score: number // 0 to 100
  status: "EXCELLENT" | "GOOD" | "AVERAGE" | "NEEDS_ATTENTION"
  summary: string
  details: Record<string, any>
  totalDays?: number
}

export interface Employee360Profile {
  employee: {
    id: string
    tenantId: string
    fullName: string
    email: string
    employeeCode: string
    departmentName: string
    designationName: string
    managerId: string | null
    managerName?: string | null
    joinDate?: string
  }
  overallScore: number
  compositeScore?: number
  dataQuality: "COMPLETE" | "PARTIAL"
  radarMetrics: Array<{ dimension: string; value: number }>
  dimensions: {
    attendance: DimensionMetric
    productivity: DimensionMetric
    performance: DimensionMetric
    learning: DimensionMetric
    recognition: DimensionMetric
  }
}

export class AuthorizationError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 403) {
    super(message)
    this.name = "AuthorizationError"
    this.statusCode = statusCode
  }
}

/**
 * Server-Side Role-Based Horizontal Authorization (Rule 2, E360-TC-005, E360-TC-006)
 */
export function authorize360Access(
  requesterId: string,
  requesterRole: string | string[],
  targetEmployeeId: string,
  targetManagerId: string | null
): boolean {
  const roles = Array.isArray(requesterRole)
    ? requesterRole.map((r) => String(r).toUpperCase())
    : [String(requesterRole).toUpperCase()]

  const isHR = roles.some((r) => ["HR", "ADMIN", "SUPERADMIN"].includes(r))
  const isManager = roles.includes("MANAGER")
  const isSelf = requesterId === targetEmployeeId

  if (isHR) return true

  if (isManager) {
    const isDirectReport = targetManagerId === requesterId
    if (isSelf || isDirectReport) return true
    throw new AuthorizationError(
      "Forbidden: Managers may only access direct reporting lines",
      403
    )
  }

  // Employee role
  if (isSelf) return true

  throw new AuthorizationError(
    "Forbidden: Horizontal peer access to Employee 360 is restricted",
    403
  )
}

/**
 * Pure 5-Dimensional Employee 360 Aggregator (E360-TC-001, E360-TC-002, E360-TC-003, E360-TC-004)
 */
export function aggregateEmployee360(rawData: {
  employee: any
  attendance?: any[]
  productivity?: any[]
  performance?: any[]
  learning?: any[]
  recognition?: any[]
}): Employee360Profile {
  const emp = rawData.employee || {}

  // 1. DIMENSION 1: ATTENDANCE (E360-TC-001, E360-TC-004 Deduplication)
  const uniquePunches = new Map<string, any>()
  for (const r of rawData.attendance || []) {
    if (!uniquePunches.has(r.date)) {
      uniquePunches.set(r.date, r)
    }
  }
  const punches = Array.from(uniquePunches.values())

  let presentCount = 0
  let lateCount = 0
  let absentCount = 0
  let totalWorkMinutes = 0
  let totalOvertimeMinutes = 0

  for (const p of punches) {
    const st = (p.status || "").toUpperCase()
    if (st === "PRESENT") presentCount++
    else if (st === "LATE") lateCount++
    else if (st === "ABSENT") absentCount++
    totalWorkMinutes += p.work_minutes || 0
    totalOvertimeMinutes += p.overtime_minutes || 0
  }

  const totalPunchDays = punches.length
  let attendanceRate = 0
  if (totalPunchDays > 0) {
    attendanceRate = Math.min(
      100,
      Math.round(((presentCount + lateCount * 0.8) / totalPunchDays) * 100)
    )
  }

  const attendanceDim: DimensionMetric = {
    dimension: "Attendance",
    score: totalPunchDays > 0 ? attendanceRate : 0,
    status:
      attendanceRate >= 90
        ? "EXCELLENT"
        : attendanceRate >= 75
        ? "GOOD"
        : "NEEDS_ATTENTION",
    summary:
      totalPunchDays > 0
        ? `${attendanceRate}% Attendance Reliability (${presentCount} Present, ${lateCount} Late)`
        : "No attendance records found",
    totalDays: totalPunchDays,
    details: {
      totalRecordedDays: totalPunchDays,
      presentCount,
      lateCount,
      absentCount,
      totalHoursLogged: Math.round((totalWorkMinutes / 60) * 10) / 10,
      overtimeHours: Math.round((totalOvertimeMinutes / 60) * 10) / 10,
    },
  }

  // 2. DIMENSION 2: PRODUCTIVITY (E360-TC-001, E360-TC-002)
  const prodLogs = rawData.productivity || []
  let tasksAssigned = 0
  let tasksCompleted = 0
  let totalEfficiency = 0

  for (const l of prodLogs) {
    tasksAssigned += l.tasks_assigned || (l.hours_logged ? 1 : 0)
    tasksCompleted += l.tasks_completed || (l.task_completion_pct === 100 ? 1 : 0)
    totalEfficiency += Number(l.efficiency_score || l.task_completion_pct || 0)
  }

  const prodCount = prodLogs.length
  const completionRate =
    tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0
  const avgEfficiency = prodCount > 0 ? Math.round(totalEfficiency / prodCount) : 0

  const productivityDim: DimensionMetric = {
    dimension: "Productivity",
    score: prodCount > 0 ? avgEfficiency : 0,
    status:
      avgEfficiency >= 85 ? "EXCELLENT" : avgEfficiency >= 70 ? "GOOD" : "AVERAGE",
    summary:
      prodCount > 0
        ? `${completionRate}% Task Completion Rate (${tasksCompleted}/${tasksAssigned} Tasks)`
        : "No productivity sprint logs recorded",
    details: {
      tasksAssigned,
      tasksCompleted,
      completionRate,
      efficiencyScore: avgEfficiency,
      hasLogs: prodCount > 0,
    },
  }

  // 3. DIMENSION 3: PERFORMANCE (E360-TC-001, E360-TC-002)
  const perfData = rawData.performance || []
  let perfScore = 0
  if (perfData.length > 0) {
    const sum = perfData.reduce((acc, p) => acc + (Number(p.score || p.rating || 0)), 0)
    perfScore = Math.round(sum / perfData.length)
  }

  const performanceDim: DimensionMetric = {
    dimension: "Performance",
    score: perfData.length > 0 ? perfScore : 0,
    status: perfScore >= 85 ? "EXCELLENT" : perfScore >= 70 ? "GOOD" : "AVERAGE",
    summary:
      perfData.length > 0
        ? `Performance Rating ${perfScore}/100 based on reviews`
        : "No performance reviews on file",
    details: {
      reviewCount: perfData.length,
      averageScore: perfScore,
    },
  }

  // 4. DIMENSION 4: LEARNING & SKILLS (E360-TC-001, E360-TC-002)
  const learnData = rawData.learning || []
  let completedCourses = 0
  let totalLearnScore = 0

  for (const c of learnData) {
    if (c.status === "Completed" || c.status === "COMPLETED") completedCourses++
    totalLearnScore += Number(c.score || c.progress_percent || 0)
  }

  const learnScore =
    learnData.length > 0 ? Math.round(totalLearnScore / learnData.length) : 0

  const learningDim: DimensionMetric = {
    dimension: "Learning",
    score: learnData.length > 0 ? learnScore : 0,
    status: learnScore >= 80 ? "EXCELLENT" : learnScore >= 50 ? "GOOD" : "AVERAGE",
    summary:
      learnData.length > 0
        ? `${completedCourses}/${learnData.length} Courses Completed`
        : "No active LMS course enrollments",
    details: {
      totalCourses: learnData.length,
      completedCourses,
      score: learnScore,
    },
  }

  // 5. DIMENSION 5: RECOGNITION (E360-TC-001, E360-TC-003)
  const recData = rawData.recognition || []
  const totalPoints = recData.reduce(
    (acc, r) => acc + (r.points || (r.award_name ? 100 : 0)),
    0
  )
  const recScore = Math.min(100, Math.round((totalPoints / 200) * 100))

  const recognitionDim: DimensionMetric = {
    dimension: "Recognition",
    score: recData.length > 0 ? recScore : 0,
    status:
      recScore >= 80 ? "EXCELLENT" : recScore >= 50 ? "GOOD" : "AVERAGE",
    summary:
      recData.length > 0
        ? `${totalPoints} Reward Points Earned (${recData.length} Awards/Kudos)`
        : "No recognition events recorded",
    details: {
      totalPoints,
      awardCount: recData.length,
    },
  }

  // 6. COMPOSITE SCORE & RADAR METRICS
  const composite = Math.round(
    (attendanceDim.score +
      productivityDim.score +
      performanceDim.score +
      learningDim.score +
      recognitionDim.score) /
      5
  )

  const isPartial =
    totalPunchDays === 0 ||
    prodCount === 0 ||
    perfData.length === 0 ||
    learnData.length === 0 ||
    recData.length === 0

  return {
    employee: {
      id: emp.id || "",
      tenantId: emp.tenant_id || emp.tenantId || "",
      fullName: emp.full_name || emp.fullName || "Staff Member",
      email: emp.email || "",
      employeeCode: emp.employee_id || emp.employeeCode || "N/A",
      departmentName: emp.department || emp.departmentName || "General",
      designationName: emp.designation || emp.designationName || "Specialist",
      managerId: emp.manager_id || emp.managerId || null,
      managerName: emp.manager_name || emp.managerName || null,
      joinDate: emp.created_at || emp.joinDate || new Date().toISOString(),
    },
    overallScore: composite,
    compositeScore: composite,
    dataQuality: isPartial ? "PARTIAL" : "COMPLETE",
    radarMetrics: [
      { dimension: "Attendance", value: attendanceDim.score },
      { dimension: "Productivity", value: productivityDim.score },
      { dimension: "Performance", value: performanceDim.score },
      { dimension: "Learning", value: learningDim.score },
      { dimension: "Recognition", value: recognitionDim.score },
    ],
    dimensions: {
      attendance: attendanceDim,
      productivity: productivityDim,
      performance: performanceDim,
      learning: learningDim,
      recognition: recognitionDim,
    },
  }
}

/**
 * Full Database-Backed 360 Aggregator
 */
export async function getEmployee360Profile(
  tenantId: string,
  targetEmployeeId: string,
  requesterId: string,
  requesterRoles: string[]
): Promise<Employee360Profile> {
  const { getSupabaseServiceClient } = await import("../supabase/server.ts")
  const serviceClient = getSupabaseServiceClient()

  // 1. Fetch Target Employee Profile & Relational Scoping (E360-TC-007)
  const { data: emp, error: empErr } = await serviceClient
    .from("employees")
    .select(`
      id, tenant_id, employee_code, manager_id,
      department:departments(name),
      designation:designations(name)
    `)
    .eq("id", targetEmployeeId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (empErr || !emp) {
    throw new AuthorizationError("Employee not found in organization", 404)
  }

  // Fetch target employee profile
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("full_name, email, created_at")
    .eq("id", targetEmployeeId)
    .maybeSingle()

  // Fetch manager profile if manager_id exists
  let managerName: string | null = null
  if (emp.manager_id) {
    const { data: mgrProfile } = await serviceClient
      .from("profiles")
      .select("full_name")
      .eq("id", emp.manager_id)
      .maybeSingle()
    if (mgrProfile) {
      managerName = mgrProfile.full_name
    }
  }

  // 2. Authorize
  authorize360Access(requesterId, requesterRoles, targetEmployeeId, emp.manager_id)

  // 3. Fetch Dimensional Data
  const [attRes, prodRes, goalsRes, revRes, learnRes, recRes] = await Promise.all([
    serviceClient
      .from("attendance_records")
      .select("date, clock_in_at, clock_out_at, status, work_minutes")
      .eq("tenant_id", tenantId)
      .eq("employee_id", targetEmployeeId),
    serviceClient
      .from("productivity_logs")
      .select("tasks_assigned, tasks_completed, efficiency_score, hours_logged")
      .eq("tenant_id", tenantId)
      .eq("employee_id", targetEmployeeId),
    serviceClient
      .from("goals")
      .select("status, target_value, current_value")
      .eq("tenant_id", tenantId)
      .eq("employee_id", targetEmployeeId),
    serviceClient
      .from("manager_reviews")
      .select("rating")
      .eq("tenant_id", tenantId)
      .eq("employee_id", targetEmployeeId),
    serviceClient
      .from("learning_enrollments")
      .select("status, progress_percent, score")
      .eq("tenant_id", tenantId)
      .eq("employee_id", targetEmployeeId),
    serviceClient
      .from("recognition_events")
      .select("points")
      .eq("tenant_id", tenantId)
      .eq("receiver_id", targetEmployeeId),
  ])

  const perfCombined = [
    ...(goalsRes.data || []).map((g: any) => ({
      score: g.status === "COMPLETED" ? 100 : 50,
    })),
    ...(revRes.data || []).map((r: any) => ({
      score: Math.round((Number(r.rating) || 4) * 20),
    })),
  ]

  return aggregateEmployee360({
    employee: {
      id: emp.id,
      tenant_id: emp.tenant_id,
      full_name: profile?.full_name || "Employee",
      email: profile?.email || "",
      employee_id: emp.employee_code,
      department: (emp.department as any)?.name || "General",
      designation: (emp.designation as any)?.name || "Staff",
      manager_id: emp.manager_id,
      manager_name: managerName,
      created_at: profile?.created_at,
    },
    attendance: (attRes.data || []).map((a: any) => ({
      ...a,
      check_in: a.clock_in_at,
      check_out: a.clock_out_at,
    })),
    productivity: prodRes.data || [],
    performance: perfCombined,
    learning: learnRes.data || [],
    recognition: recRes.data || [],
  })
}
