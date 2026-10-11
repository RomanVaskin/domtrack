import { NextResponse } from 'next/server'
import { getActiveReferralPartnerByCode } from '@/lib/referral-partners'
import { REFERRAL_COOKIE_MAX_AGE_SECONDS, REFERRAL_COOKIE_NAME } from '@/lib/referral-attribution'

/**
 * Website referral entry point: /r/<code>. Sets first-party attribution for a valid, active
 * partner code, then redirects home. An unknown or disabled code redirects home with no cookie.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const partner = await getActiveReferralPartnerByCode(code)
  const response = NextResponse.redirect(new URL('/', request.url))

  if (partner) {
    response.cookies.set(REFERRAL_COOKIE_NAME, partner.code, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    })
  }

  return response
}
