/**
 * Many sites refuse to load inside an iframe (X-Frame-Options / CSP
 * frame-ancestors). These are well-known ones that offer an embeddable URL;
 * we rewrite their normal share links to it. Anything else is tried as-is,
 * with "Open together" and "Share screen" as fallbacks.
 */
export function embedUrl(input: string, host = location.hostname): string | null {
  let u: URL
  try { u = new URL(input.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  const h = u.hostname.replace(/^www\./, '')
  if (h === 'figma.com' && !u.pathname.startsWith('/embed')) {
    return `https://www.figma.com/embed?embed_host=pixel-office&url=${encodeURIComponent(u.href)}`
  }
  if (h === 'docs.google.com') {
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/)
    if (m) return m[1] === 'presentation' ? `https://docs.google.com/presentation/d/${m[2]}/embed` : `https://docs.google.com/${m[1]}/d/${m[2]}/preview`
  }
  if (h === 'vimeo.com') {
    const id = u.pathname.match(/^\/(\d+)/)?.[1]
    if (id) return `https://player.vimeo.com/video/${id}`
  }
  if (h === 'loom.com') {
    const id = u.pathname.match(/^\/share\/([a-f0-9]+)/)?.[1]
    if (id) return `https://www.loom.com/embed/${id}`
  }
  if (h === 'twitch.tv') {
    const ch = u.pathname.split('/')[1]
    if (ch) return `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=${encodeURIComponent(host)}`
  }
  return u.href
}
