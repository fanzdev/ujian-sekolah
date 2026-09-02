import DOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr',
  'td', 'th', 'code', 'pre', 'blockquote', 'span', 'div', 'sup', 'sub',
]

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'colspan', 'rowspan']

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}

export function stripHtml(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = sanitizeHtml(html)
  return (el.textContent ?? '').trim()
}
