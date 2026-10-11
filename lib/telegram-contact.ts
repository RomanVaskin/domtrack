export const TELEGRAM_CONTACT_URL = 'https://t.me/DomTrackBot'
export const TELEGRAM_PARTNER_START_URL = `${TELEGRAM_CONTACT_URL}?start=partner`

export function buildReferralTelegramDeepLink(code: string): string {
  return `${TELEGRAM_CONTACT_URL}?start=ref_${encodeURIComponent(code)}`
}

/**
 * The single place that decides which Telegram URL a public "order" CTA should use: the
 * referral deep link when attribution exists, otherwise the plain contact link unchanged.
 * Every homepage/partners-page order CTA goes through this instead of re-deriving it.
 */
export function resolveTelegramOrderUrl(referralCode: string | null): string {
  return referralCode ? buildReferralTelegramDeepLink(referralCode) : TELEGRAM_CONTACT_URL
}
