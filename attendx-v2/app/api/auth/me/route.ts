import { NextResponse } from 'next/server'
import { ServerIdentity } from '@/lib/auth/server-identity'

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  try {
    const caller = await ServerIdentity.getAuthoritativeCaller([
      'SUPERADMIN', 'ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'
    ], request)

    return NextResponse.json({
      success: true,
      user: {
        id: caller.userId,
        email: caller.email,
        role: caller.role,
        tenant_id: caller.tenantId,
        tenant: {
          id: caller.tenantId,
          name: 'Acme Corporation',
          slug: 'acme',
          app_name: 'AttendX',
          accent_color: '#4F46E5',
        },
        profile: {
          id: caller.userId,
          email: caller.email,
          full_name: caller.email.split('@')[0],
          is_active: true,
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Unauthenticated', message: err?.message }, { status: 401 })
  }
}
