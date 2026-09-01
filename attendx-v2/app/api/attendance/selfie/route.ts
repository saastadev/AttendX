import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

// ============================================================
// Attendance selfie upload.
//
// Check-in selfies are biometric-adjacent personal data. This endpoint
// previously created the bucket with `public: true` and returned a public
// URL, making every tenant's selfies readable by anyone with the link. It
// also took the storage path straight from the client alongside
// `upsert: true`, so a caller could overwrite another employee's selfie.
//
// Now: private bucket, server-derived path scoped to tenant + user, and a
// short-lived signed URL.
// ============================================================

const BUCKET = 'attendance-selfies'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days
// The check-in page uses 'in'/'out'; accept both spellings and normalise.
const KIND_ALIASES: Record<string, string> = {
  in: 'clock_in', out: 'clock_out',
  clock_in: 'clock_in', clock_out: 'clock_out',
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const { data } = await getSupabaseServiceClient().auth.getUser(token)
        if (data?.user) { user = data.user; authErr = null }
      }
    }
    if (!user || authErr) {
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    const { selfieDataUrl, kind: rawKind = 'clock_in' } = await req.json()
    const kind = KIND_ALIASES[String(rawKind)]
    if (!selfieDataUrl || typeof selfieDataUrl !== 'string') {
      return NextResponse.json({ error: 'Missing selfieDataUrl' }, { status: 400 })
    }
    if (!kind) {
      return NextResponse.json(
        { error: `Invalid kind "${rawKind}" (expected in|out|clock_in|clock_out)` },
        { status: 400 }
      )
    }

    const match = /^data:image\/(jpeg|jpg|png|webp);base64,/.exec(selfieDataUrl)
    if (!match) {
      return NextResponse.json({ error: 'Only base64 JPEG/PNG/WebP images are accepted' }, { status: 400 })
    }

    const buffer = Buffer.from(selfieDataUrl.slice(match[0].length), 'base64')
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty image payload' }, { status: 400 })
    }
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 5 MB limit' }, { status: 413 })
    }

    const serviceClient = getSupabaseServiceClient()

    // Tenant comes from the server-side membership record, never the request.
    const { data: emp } = await serviceClient
      .from('employees').select('tenant_id').eq('id', user.id).maybeSingle()
    const { data: prof } = await serviceClient
      .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle()

    const tenantId = emp?.tenant_id ?? prof?.tenant_id
    if (!tenantId) {
      return NextResponse.json(
        { error: 'No tenant membership resolved for this user' }, { status: 403 }
      )
    }

    const { data: buckets } = await serviceClient.storage.listBuckets()
    if (!buckets?.some(b => b.name === BUCKET)) {
      await serviceClient.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      })
    }

    // Path is derived server-side, so one user cannot target another's object.
    const ext = match[1] === 'png' ? 'png' : match[1] === 'webp' ? 'webp' : 'jpg'
    const path = `${tenantId}/${user.id}/${new Date().toISOString().slice(0, 10)}-${kind}-${Date.now()}.${ext}`

    const { data: uploadData, error: uploadErr } = await serviceClient.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: `image/${match[1]}`, upsert: false })

    if (uploadErr) {
      console.error('[Selfie Upload] failed:', uploadErr)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: signed, error: signErr } = await serviceClient.storage
      .from(BUCKET)
      .createSignedUrl(uploadData.path, SIGNED_URL_TTL)

    if (signErr || !signed) {
      console.error('[Selfie Upload] signing failed:', signErr)
      return NextResponse.json({ error: 'Upload stored but URL signing failed' }, { status: 500 })
    }

    return NextResponse.json({
      path: uploadData.path,
      signedUrl: signed.signedUrl,
      // Back-compat with existing callers reading `publicUrl`. The object is
      // NOT public: this is a time-limited signed URL.
      publicUrl: signed.signedUrl,
      expiresIn: SIGNED_URL_TTL,
    })
  } catch (err: any) {
    console.error('[Selfie Upload] unhandled:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
