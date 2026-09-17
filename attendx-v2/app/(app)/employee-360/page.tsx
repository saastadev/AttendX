'use client'

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  Calendar, CheckCircle, TrendingUp, BookOpen, Award,
  Clock, ShieldAlert, RefreshCw, User, Briefcase, Users
} from "lucide-react"
import { PageWrapper } from "@/components/ui/PageWrapper"
import { useAuthStore } from "@/store/auth.store"

// --- Pure SVG Radar Chart (Turbopack Safe & 390px Mobile Responsive) ---
function RadarChart({ metrics }: { metrics: Array<{ dimension: string; value: number }> }) {
  const size = 260
  const center = size / 2
  const radius = 95
  const count = metrics.length

  const angleStep = (Math.PI * 2) / count

  // Background web rings (25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0].map((level, ringIdx) => {
    const points = Array.from({ length: count }).map((_, i) => {
      const angle = i * angleStep - Math.PI / 2
      const r = radius * level
      const x = center + r * Math.cos(angle)
      const y = center + r * Math.sin(angle)
      return `${x},${y}`
    }).join(" ")
    return (
      <polygon
        key={ringIdx}
        points={points}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeDasharray={level === 1.0 ? "none" : "2,2"}
      />
    )
  })

  // Data polygon points
  const polygonPoints = metrics.map((m, i) => {
    const angle = i * angleStep - Math.PI / 2
    const r = (Math.min(100, Math.max(0, m.value)) / 100) * radius
    const x = center + r * Math.cos(angle)
    const y = center + r * Math.sin(angle)
    return `${x},${y}`
  }).join(" ")

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: "100%", height: "auto" }}>
        {rings}
        {/* Spokes */}
        {metrics.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2
          const x2 = center + radius * Math.cos(angle)
          const y2 = center + radius * Math.sin(angle)
          return <line key={i} x1={center} y1={center} x2={x2} y2={y2} stroke="var(--border)" strokeWidth="1" />
        })}
        {/* Area fill */}
        <polygon
          points={polygonPoints}
          fill="rgba(59, 130, 246, 0.25)"
          stroke="#3B82F6"
          strokeWidth="2"
        />
        {/* Metric dots & labels */}
        {metrics.map((m, i) => {
          const angle = i * angleStep - Math.PI / 2
          const r = (Math.min(100, Math.max(0, m.value)) / 100) * radius
          const x = center + r * Math.cos(angle)
          const y = center + r * Math.sin(angle)
          const labelR = radius + 22
          const lx = center + labelR * Math.cos(angle)
          const ly = center + labelR * Math.sin(angle)
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={4} fill="#3B82F6" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="600"
                fill="var(--text-secondary)"
              >
                {m.dimension}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Employee360Content() {
  const user = useAuthStore(s => s.user)
  const searchParams = useSearchParams()
  const paramId = searchParams.get("employeeId")
  const [targetId, setTargetId] = useState<string>(paramId || "")

  useEffect(() => {
    const q = searchParams.get("employeeId")
    if (q && q !== targetId) {
      setTargetId(q)
    }
  }, [searchParams])

  const isHR = user && ['SUPERADMIN', 'ADMIN', 'HR', 'MANAGER'].includes((user.role as string)?.toUpperCase?.() || '')

  // Fetch employee list for switcher if HR/Admin
  const { data: employeeList } = useQuery({
    queryKey: ['employee-switcher-list', user?.tenant?.id],
    queryFn: async () => {
      const res = await fetch('/api/admin/employees?pageSize=100')
      if (!res.ok) return []
      const json = await res.json()
      return json.data || []
    },
    enabled: !!isHR,
  })

  const activeId = targetId || user?.id

  const { data: response, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["employee-360", activeId],
    queryFn: async () => {
      const url = activeId ? `/api/employee-360?employeeId=${activeId}` : `/api/employee-360`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to load 360 profile")
      }
      return res.json()
    },
    enabled: !!user && !!activeId,
  })

  const profile = response?.profile

  return (
    <PageWrapper style={{ maxWidth: 1050, margin: "0 auto", padding: "16px 14px", width: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Employee 360° Overview
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>
            Holistic 5-dimensional workforce intelligence scorecard
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {isHR && employeeList && employeeList.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={15} color="var(--text-tertiary)" />
              <select
                value={activeId}
                onChange={(e) => setTargetId(e.target.value)}
                style={{
                  padding: "8px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {employeeList.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.employee?.employee_code || emp.role})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              fontSize: 13, cursor: "pointer", color: "var(--text-primary)"
            }}
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh Profile
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          Loading 360° scorecard data...
        </div>
      ) : isError ? (
        <div style={{ padding: 20, borderRadius: 10, background: "#FEE2E2", color: "#991B1B", display: "flex", gap: 10, alignItems: "center" }}>
          <ShieldAlert size={20} />
          <span>{(error as any)?.message || "Unauthorized access to Employee 360 profile"}</span>
        </div>
      ) : profile ? (
        <>
          {/* Identity & Composite Header */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
            padding: 18, marginBottom: 20, display: "flex", justifyContent: "space-between",
            alignItems: "center", flexWrap: "wrap", gap: 16
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", background: "var(--primary)",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 18
              }}>
                {profile.employee.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  {profile.employee.fullName}
                </h2>
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                  <span>Code: {profile.employee.employeeCode}</span>
                  <span>•</span>
                  <span>{profile.employee.designationName}</span>
                  <span>•</span>
                  <span>{profile.employee.departmentName}</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 120 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>Overall Score</span>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#3B82F6", lineHeight: 1.1 }}>
                {profile.overallScore}<span style={{ fontSize: 18, fontWeight: 500, color: "var(--text-tertiary)" }}>/100</span>
              </div>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                background: profile.dataQuality === "COMPLETE" ? "#DCFCE7" : "#FEF3C7",
                color: profile.dataQuality === "COMPLETE" ? "#166534" : "#92400E"
              }}>
                {profile.dataQuality} DATA QUALITY
              </span>
            </div>
          </div>

          {/* Grid Layout: Radar Chart + 5 Dimension Cards (Fully responsive on 390px) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
            {/* Radar Card */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "var(--text-primary)", width: "100%" }}>
                5-Dimension Balanced Radar
              </h3>
              <RadarChart metrics={profile.radarMetrics} />
            </div>

            {/* Dimension Breakdown Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Attendance */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Calendar size={16} color="#3B82F6" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Attendance Dimension</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#3B82F6" }}>{profile.dimensions.attendance.score}%</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {profile.dimensions.attendance.summary}
                </p>
              </div>

              {/* Productivity */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle size={16} color="#10B981" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Productivity Dimension</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#10B981" }}>{profile.dimensions.productivity.score}%</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {profile.dimensions.productivity.summary}
                </p>
              </div>

              {/* Performance */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TrendingUp size={16} color="#8B5CF6" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Performance Dimension</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#8B5CF6" }}>{profile.dimensions.performance.score}%</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {profile.dimensions.performance.summary}
                </p>
              </div>

              {/* Learning */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <BookOpen size={16} color="#EC4899" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Learning & Skills</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#EC4899" }}>{profile.dimensions.learning.score}%</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {profile.dimensions.learning.summary}
                </p>
              </div>

              {/* Recognition */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Award size={16} color="#F59E0B" />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Recognition & Rewards</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#F59E0B" }}>{profile.dimensions.recognition.score}%</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
                  {profile.dimensions.recognition.summary}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </PageWrapper>
  )
}

export default function Employee360Page() {
  return (
    <Suspense fallback={
      <PageWrapper style={{ maxWidth: 1050, margin: "0 auto", padding: "16px 14px" }}>
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>
          Loading 360° scorecard data...
        </div>
      </PageWrapper>
    }>
      <Employee360Content />
    </Suspense>
  )
}
