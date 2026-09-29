import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('attendx-demo-session')
  response.cookies.delete('sb-access-token')
  response.cookies.delete('sb-refresh-token')
  return response
}

export async function GET(request: Request) {
  const url = new URL('/auth/login?switch=true', request.url)
  const response = NextResponse.redirect(url)
  response.cookies.delete('attendx-demo-session')
  response.cookies.delete('sb-access-token')
  response.cookies.delete('sb-refresh-token')
  return response
}
