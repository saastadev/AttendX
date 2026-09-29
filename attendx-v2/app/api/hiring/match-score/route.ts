// ============================================================
// AttendX v2 — REST API: /api/hiring/match-score
// POST: Compute bias-free match score between candidate & requisition
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { MatchScoreEngine } from '@/lib/hiring/match-score-engine'

export async function POST(request: Request) {
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    const body = await request.json()
    const { candidate_id, requisition_id } = body

    if (!candidate_id || !requisition_id) {
      return NextResponse.json(
        { error: 'candidate_id and requisition_id are required' },
        { status: 400 }
      )
    }

    const serviceClient = getSupabaseServiceClient()

    // 1. Fetch candidate (excluding PII)
    const { data: candidate, error: candErr } = await serviceClient
      .from('candidates')
      .select('total_experience_years, raw_resume_text, skills:candidate_skills(skill_name, experience_years, proficiency_level)')
      .eq('organization_id', caller.tenantId)
      .eq('id', candidate_id)
      .single()

    if (candErr || !candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    }

    // 2. Fetch requisition
    const { data: requisition, error: reqErr } = await serviceClient
      .from('job_requisitions')
      .select('title, min_experience_years, max_experience_years, job_description, skills:job_requisition_skills(*)')
      .eq('organization_id', caller.tenantId)
      .eq('id', requisition_id)
      .single()

    if (reqErr || !requisition) {
      return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
    }

    // 3. Compute score
    const result = MatchScoreEngine.compute(
      {
        total_experience_years: candidate.total_experience_years || 0,
        skills: candidate.skills || [],
        raw_resume_text: candidate.raw_resume_text,
      },
      requisition
    )

    // 4. Optionally update application if exists
    await serviceClient
      .from('job_applications')
      .update({
        match_score: result.match_score,
        skill_score: result.skill_score,
        experience_score: result.experience_score,
        jd_relevance_score: result.jd_relevance_score,
        match_reasoning: result.reasoning,
      })
      .eq('organization_id', caller.tenantId)
      .eq('candidate_id', candidate_id)
      .eq('requisition_id', requisition_id)

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
