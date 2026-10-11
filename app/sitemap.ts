import type { MetadataRoute } from 'next'
import { domTrackBaseUrl } from '@/lib/domtrack-url'

/**
 * Public indexable pages only. `/o/[token]`, `/worker/[token]` and `/partner/[token]` are
 * personal, token-gated pages (order tracking, worker view, partner stats) — never canonical
 * content to index. `/r/[code]` is a redirect route (`route.ts`), not a page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = domTrackBaseUrl().replace(/\/$/, '')
  return ['', '/partners'].map((path) => ({ url: `${baseUrl}${path}` }))
}
