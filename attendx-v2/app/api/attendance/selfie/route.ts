import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient, getSupabaseServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient()
    let { data: { user }, error: authErr } = await supabase.auth.getUser()

    if (!user || authErr) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader?.startsWith('Bearer ')) {
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
      return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 })
    }

    const { selfieDataUrl, fileName } = await req.json()
    if (!selfieDataUrl || !fileName) {
      return NextResponse.json({ error: 'Missing selfieDataUrl or fileName' }, { status: 400 })
    }

    // Extract base64 data
    const base64Data = selfieDataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const serviceClient = getSupabaseServiceClient()

    // Ensure bucket exists
    const { data: buckets } = await serviceClient.storage.listBuckets()
    const bucket = buckets?.find((b: any) => b.name === 'attendance-selfies')
    if (!bucket) {
      await serviceClient.storage.createBucket('attendance-selfies', { public: true })
    }

    const { data: uploadData, error: uploadErr } = await serviceClient.storage
      .from('attendance-selfies')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      console.error('[Selfie Upload API Error]:', uploadErr)
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = serviceClient.storage
      .from('attendance-selfies')
      .getPublicUrl(uploadData.path)

    return NextResponse.json({ publicUrl: urlData.publicUrl })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
