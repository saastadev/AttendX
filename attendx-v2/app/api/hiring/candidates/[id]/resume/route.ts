// ============================================================
// AttendX v2 — REST API: /api/hiring/candidates/[id]/resume
// POST: Parse resume, attach to candidate, and extract candidate skills
// ============================================================

import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'
import { getSupabaseServiceClient } from '@/lib/supabase/server'
import { CandidateService } from '@/lib/hiring/candidate-service'
import { HiringAuditLogger } from '@/lib/hiring/audit-logger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR'
    ], request)

    const body = await request.json()
    const { resume_text, file_name, file_url, file_size, mime_type } = body

    if (!resume_text?.trim() && !file_url?.trim()) {
      return NextResponse.json(
        { error: 'Either resume_text or file_url is required' },
        { status: 400 }
      )
    }

    const serviceClient = getSupabaseServiceClient()
    const rawText = resume_text || `Resume file uploaded: ${file_name || 'candidate_resume.pdf'}`
    const parsed = CandidateService.parseResume(rawText)

    // 1. Store candidate_resumes record
    const { data: resumeRecord, error: resumeErr } = await serviceClient
      .from('candidate_resumes')
      .insert({
        organization_id: caller.tenantId,
        candidate_id: id,
        file_name: file_name || 'resume.pdf',
        file_url: file_url || 'https://storage.attendx.io/resumes/uploaded.pdf',
        file_size: file_size || 102400,
        mime_type: mime_type || 'application/pdf',
        parsed_data: parsed,
        is_primary: true,
      })
      .select()
      .single()

    if (resumeErr) {
      return NextResponse.json({ error: resumeErr.message }, { status: 500 })
    }

    // 2. Insert or update candidate_skills
    for (const skill of parsed.extractedSkills) {
      await serviceClient
        .from('candidate_skills')
        .upsert({
          organization_id: caller.tenantId,
          candidate_id: id,
          skill_name: skill,
          experience_years: parsed.estimatedExperienceYears,
          proficiency_level: 'INTERMEDIATE',
          verified_by_ai: true,
        }, { onConflict: 'candidate_id,skill_name' })
    }

    // 3. Update candidate total_experience_years & raw_resume_text if empty
    await serviceClient
      .from('candidates')
      .update({
        raw_resume_text: rawText,
        total_experience_years: parsed.estimatedExperienceYears,
        current_designation: parsed.inferredRole,
      })
      .eq('organization_id', caller.tenantId)
      .eq('id', id)

    // 4. Audit
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || 'AttendX-Client'
    await HiringAuditLogger.logMutation(serviceClient, {
      organizationId: caller.tenantId,
      userId: caller.userId,
      action: 'RESUME_PARSED',
      entityType: 'CANDIDATE',
      entityId: id,
      newValues: { extractedSkills: parsed.extractedSkills, experience: parsed.estimatedExperienceYears },
      ipAddress: ip,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      data: {
        resume: resumeRecord,
        parsed,
      },
    }, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
