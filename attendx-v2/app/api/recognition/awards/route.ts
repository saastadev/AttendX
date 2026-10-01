import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Static Canonical Catalogs & Reward Mappings per AttendX MVP Specification
export const MONTHLY_AWARDS = [
  { id: 'award-m-01', name: 'Employee of the Month', period: 'MONTHLY', points: 500, description: 'Highest performing team member of the calendar month.' },
  { id: 'award-m-02', name: 'Rising Star Award', period: 'MONTHLY', points: 500, description: 'Most promising contributor with rapid learning and delivery.' },
  { id: 'award-m-03', name: 'Customer Champion Award', period: 'MONTHLY', points: 500, description: 'Exemplary customer satisfaction and stakeholder service.' },
  { id: 'award-m-04', name: 'Team Player Award', period: 'MONTHLY', points: 500, description: 'Outstanding peer collaboration and team enablement.' },
]

export const QUARTERLY_AWARDS = [
  { id: 'award-q-01', name: 'Innovation Award', period: 'QUARTERLY', points: 750, description: 'Pioneering solution or process optimization delivering tangible impact.' },
  { id: 'award-q-02', name: 'Excellence in Delivery Award', period: 'QUARTERLY', points: 750, description: 'Flawless milestone execution and high-quality project turnaround.' },
  { id: 'award-q-03', name: 'Sales Achiever Award', period: 'QUARTERLY', points: 750, description: 'Target milestone overachievement and revenue acceleration.' },
  { id: 'award-q-04', name: 'Operational Excellence Award', period: 'QUARTERLY', points: 750, description: 'Unwavering systems reliability and operational rigor.' },
]

export const ANNUAL_AWARDS = [
  { id: 'award-a-01', name: 'Employee of the Year', period: 'ANNUAL', points: 1000, description: 'Premier organizational contributor across performance and culture.' },
  { id: 'award-a-02', name: 'Leadership Excellence Award', period: 'ANNUAL', points: 1000, description: 'Exemplary leadership, mentorship, and strategic impact.' },
  { id: 'award-a-03', name: 'Innovator of the Year', period: 'ANNUAL', points: 1000, description: 'Transformational innovation adopted organization-wide.' },
  { id: 'award-a-04', name: 'Customer Delight Award', period: 'ANNUAL', points: 1000, description: 'Exceptional long-term client trust and relationship stewardship.' },
  { id: 'award-a-05', name: 'Best Manager Award', period: 'ANNUAL', points: 1000, description: 'Top team retention, growth, and empathetic people management.' },
  { id: 'award-a-06', name: 'Culture Champion Award', period: 'ANNUAL', points: 1000, description: 'Inspiring adherence to core company values and ethics.' },
  { id: 'award-a-07', name: 'Top Performer Award', period: 'ANNUAL', points: 1000, description: 'Sustained top-percentile KPI delivery throughout the year.' },
  { id: 'award-a-08', name: 'CEO Excellence Award', period: 'ANNUAL', points: 1000, description: 'Executive board recognition for landmark enterprise contributions.' },
]

export const REWARD_MAPPINGS = [
  { performance_level: 'Meets Expectations', reward_item: 'Appreciation Certificate', value_type: 'CERTIFICATE', points: 100 },
  { performance_level: 'Exceeds Expectations', reward_item: 'Gift Voucher', value_type: 'VOUCHER', points: 250 },
  { performance_level: 'Outstanding Performer', reward_item: 'Performance Bonus', value_type: 'BONUS', points: 500 },
  { performance_level: 'Employee of the Quarter', reward_item: 'Trophy + Voucher', value_type: 'TROPHY_VOUCHER', points: 750 },
  { performance_level: 'Employee of the Year', reward_item: 'Trophy + Cash Award + Additional Leave', value_type: 'COMPREHENSIVE_PACKAGE', points: 1000 },
]

/**
 * Recognition Awards & Executive Nominations Engine
 * (REC_TC_009 - REC_TC_019, REC_TC_028)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) { user = userData.user; authErr = null }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Tenant context
    const { data: roles } = await serviceClient.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const activeTenantClaim = (user.app_metadata as any)?.tenant_id as string | undefined
    const tenantId = req.headers.get('x-tenant-id') || activeTenantClaim || roles?.[0]?.tenant_id

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    // Fetch existing awards & nominations recorded in recognition_events (using note JSON or category metadata)
    const { data: awardEvents } = await serviceClient
      .from('recognition_events')
      .select('id, giver_id, receiver_id, points, note, created_at, category:recognition_categories(name)')
      .eq('tenant_id', tenantId)
      .gte('points', 500)
      .order('created_at', { ascending: false })
      .limit(50)

    const { data: profiles } = await serviceClient.from('profiles').select('id, full_name, email').eq('tenant_id', tenantId)
    const profMap = new Map((profiles || []).map(p => [p.id, p]))

    const formattedAwards = (awardEvents || []).map(ev => {
      let isPending = false
      let nominationReason = ev.note
      if (ev.note && ev.note.startsWith('{')) {
        try {
          const parsed = JSON.parse(ev.note)
          if (parsed.status === 'PENDING') isPending = true
          if (parsed.reason) nominationReason = parsed.reason
        } catch {
          // Fallback to raw note string if JSON parsing fails
        }
      }

      const catName = Array.isArray(ev.category) ? (ev.category as any)[0]?.name : (ev.category as any)?.name

      return {
        id: ev.id,
        nominee_name: profMap.get(ev.receiver_id)?.full_name || 'Team Member',
        nominee_id: ev.receiver_id,
        nominator_name: profMap.get(ev.giver_id)?.full_name || 'Manager',
        award_name: catName || 'Executive Award',
        points: ev.points,
        status: isPending ? 'PENDING_APPROVAL' : 'APPROVED',
        reason: nominationReason,
        created_at: ev.created_at,
      }
    })

    return NextResponse.json({
      tenant_id: tenantId,
      monthly_awards: MONTHLY_AWARDS,
      quarterly_awards: QUARTERLY_AWARDS,
      annual_awards: ANNUAL_AWARDS,
      reward_mappings: REWARD_MAPPINGS,
      awards_and_nominations: formattedAwards,
      summary: {
        monthly_count: MONTHLY_AWARDS.length,
        quarterly_count: QUARTERLY_AWARDS.length,
        annual_count: ANNUAL_AWARDS.length,
        reward_mappings_count: REWARD_MAPPINGS.length,
      },
    })
  } catch (err: any) {
    console.error('[Recognition Awards API Error]:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()
    const serviceClient = getSupabaseServiceClient()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data: userData } = await serviceClient.auth.getUser(token)
        if (userData?.user) { user = userData.user; authErr = null }
      }
    }

    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: roles } = await serviceClient.from('user_roles').select('role, tenant_id').eq('user_id', user.id)
    const isHRorAdmin = roles?.some(r => ['HR', 'ADMIN', 'SUPERADMIN', 'MANAGER'].includes(r.role))

    const activeTenantClaim = (user.app_metadata as any)?.tenant_id as string | undefined
    const tenantId = req.headers.get('x-tenant-id') || activeTenantClaim || roles?.[0]?.tenant_id

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context missing' }, { status: 400 })
    }

    const body = await req.json()
    const { action, nominee_id, award_id, reason, event_id } = body

    // 1. Submit Nomination (REC_TC_012, REC_TC_013, REC_TC_014, REC_TC_028)
    if (action === 'nominate') {
      if (!nominee_id || !uuidRegex.test(nominee_id)) {
        return NextResponse.json({ error: 'Valid nominee_id is required' }, { status: 400 })
      }
      if (!award_id || !reason) {
        return NextResponse.json({ error: 'award_id and reason are required' }, { status: 400 })
      }

      // Check award exists in any catalog
      const allAwards = [...MONTHLY_AWARDS, ...QUARTERLY_AWARDS, ...ANNUAL_AWARDS]
      const award = allAwards.find(a => a.id === award_id || a.name.toLowerCase() === award_id.toLowerCase())
      if (!award) {
        return NextResponse.json({ error: `Award "${award_id}" not found in MVP catalog` }, { status: 404 })
      }

      // Verify nominee belongs to tenant
      const { data: nomineeProfile } = await serviceClient
        .from('profiles')
        .select('id, full_name, tenant_id')
        .eq('id', nominee_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!nomineeProfile) {
        return NextResponse.json({ error: 'Nominee not found in your organization' }, { status: 404 })
      }

      // Find or link a recognition category row for this award
      let { data: categoryRow } = await serviceClient
        .from('recognition_categories')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', award.name)
        .maybeSingle()

      if (!categoryRow) {
        // Fallback to highest tier category in tenant
        const { data: fallbackCat } = await serviceClient
          .from('recognition_categories')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('points', 500)
          .limit(1)
          .maybeSingle()
        categoryRow = fallbackCat
      }

      const notePayload = JSON.stringify({
        status: 'PENDING',
        nomination: true,
        award_id: award.id,
        award_name: award.name,
        period: award.period,
        reason: reason.trim(),
        nominated_at: new Date().toISOString(),
      })

      // Insert recognition event with PENDING note (REC_TC_028)
      const { data: eventRow, error: insErr } = await serviceClient
        .from('recognition_events')
        .insert({
          tenant_id: tenantId,
          giver_id: user.id,
          receiver_id: nominee_id,
          category_id: categoryRow?.id || '0cac7b4a-d847-4ca3-85f1-bfe122ba261c',
          points: award.points,
          note: notePayload,
          is_public: false, // remains private/pending until approved
        })
        .select()
        .single()

      if (insErr) {
        return NextResponse.json({ error: 'Failed to record nomination: ' + insErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'nominate',
        status: 'PENDING_APPROVAL',
        id: eventRow.id,
        nomination_id: eventRow.id,
        nomination: {
          id: eventRow.id,
          award: award.name,
          nominee: nomineeProfile.full_name,
          points: award.points,
          status: 'PENDING_APPROVAL',
          note: reason.trim(),
        },
        message: `Nomination for ${nomineeProfile.full_name} submitted successfully! Awaiting HR/Admin executive approval.`,
      }, { status: 201 })
    }

    // 2. Approve Nomination (REC_TC_028)
    if (action === 'approve') {
      if (!isHRorAdmin) {
        return NextResponse.json({ error: 'Forbidden: Only HR or Administrators can approve award nominations.' }, { status: 403 })
      }
      const targetEventId = event_id || body.nomination_id || body.id
      if (!targetEventId || !uuidRegex.test(targetEventId)) {
        return NextResponse.json({ error: 'Valid event_id or nomination_id is required' }, { status: 400 })
      }

      const { data: targetEvent, error: findErr } = await serviceClient
        .from('recognition_events')
        .select('*')
        .eq('id', targetEventId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (findErr || !targetEvent) {
        return NextResponse.json({ error: 'Nomination event not found' }, { status: 404 })
      }

      let parsedNote: any = {}
      try { parsedNote = JSON.parse(targetEvent.note) } catch { parsedNote = { reason: targetEvent.note } }

      parsedNote.status = 'APPROVED'
      parsedNote.approved_by = user.id
      parsedNote.approved_at = new Date().toISOString()

      const { error: updErr } = await serviceClient
        .from('recognition_events')
        .update({
          note: JSON.stringify(parsedNote),
          is_public: true, // becomes public on approval
        })
        .eq('id', targetEventId)

      if (updErr) {
        return NextResponse.json({ error: 'Failed to approve nomination: ' + updErr.message }, { status: 500 })
      }

      // Dispatch notification to recipient
      await serviceClient.from('notifications').insert({
        tenant_id: tenantId,
        user_id: targetEvent.receiver_id,
        type: 'RECOGNITION_RECEIVED',
        title: `Congratulations! Your Award has been Approved! 🏆`,
        body: `You have been officially awarded ${parsedNote.award_name || 'an Executive Award'} (+${targetEvent.points} pts)!`,
        deep_link: '/recognition',
        data: { event_id: targetEvent.id, points: targetEvent.points },
        is_read: false,
      })

      return NextResponse.json({
        success: true,
        action: 'approve',
        status: 'APPROVED',
        event_id: targetEvent.id,
        message: 'Nomination successfully approved and finalized as official award! Points credited to recipient.',
      })
    }

    return NextResponse.json({ error: 'Invalid action. Supported: "nominate", "approve"' }, { status: 400 })
  } catch (err: any) {
    console.error('[Recognition Awards POST Error]:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
