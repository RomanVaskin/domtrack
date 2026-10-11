import type { MetadataRoute } from 'next'
import { domTrackBaseUrl } from '@/lib/domtrack-url'

/**
 * The public site is open to crawlers. No `Disallow` — the token-gated personal pages (/o,
 * /worker, /partner) aren't guessable and aren't excluded here on purpose. Sitemap is the
 * existing app/sitemap.ts (https://domtrack.ru/sitemap.xml).
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = domTrackBaseUrl().replace(/\/$/, '')
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
