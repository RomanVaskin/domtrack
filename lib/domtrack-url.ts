const DEFAULT_BASE_URL = 'https://domtrack.ru'

export function domTrackBaseUrl(): string {
  const configured = process.env.DOMTRACK_BASE_URL?.trim() || DEFAULT_BASE_URL
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid protocol')
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return `${DEFAULT_BASE_URL}/`
  }
}

export function domTrackUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), domTrackBaseUrl()).toString()
}
