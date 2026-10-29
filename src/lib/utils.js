// Shrink a phone photo to ~150–250 KB JPEG before upload.
export function compressImage(file, maxSide = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url)
        b ? resolve(b) : reject(new Error('Could not read this photo'))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this photo. Please use a JPG or PNG.'))
    }
    img.src = url
  })
}

export function randomToken(len = 24) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export function uuid() {
  return crypto.randomUUID()
}

export function normalizePhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.startsWith('63') && d.length === 12) return '0' + d.slice(2)
  return d
}
export const validPhone = (p) => /^09\d{9}$/.test(normalizePhone(p))

export const cx = (...a) => a.filter(Boolean).join(' ')
