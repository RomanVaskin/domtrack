import { cookies } from 'next/headers'

export {
  buildReferralTelegramDeepLink,
  resolveTelegramOrderUrl,
  TELEGRAM_CONTACT_URL,
  TELEGRAM_PARTNER_START_URL,
} from './telegram-contact.ts'

export const REFERRAL_COOKIE_NAME = 'referral_code'
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/

/** Reads the referral code a /r/[code] visit attributed to this browser, if any. */
export async function getReferralCodeFromCookies(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(REFERRAL_COOKIE_NAME)?.value
  return value && REFERRAL_CODE_PATTERN.test(value) ? value : null
}
