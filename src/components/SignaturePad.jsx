import { useEffect, useRef, useState } from 'react'

// Draw with finger or mouse. onChange gets a trimmed PNG data URL (or null when cleared).
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const w = c.offsetWidth
    const h = c.offsetHeight
    c.width = w * ratio
    c.height = h * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = '#1D1B16'
  }, [])

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const down = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
    ctx.fillStyle = '#1D1B16'
    ctx.fill()
  }
  const move = (e) => {
    if (!drawing.current) return
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    setEmpty(false)
    onChange?.(exportTrimmed(canvasRef.current))
  }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange?.(null)
  }

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-line bg-white">
        <canvas
          ref={canvasRef}
          className="block h-44 w-full touch-none rounded-xl"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint">
            Sign here with your finger
          </div>
        )}
        <div className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-line" />
      </div>
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={clear} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
          Clear signature
        </button>
      </div>
    </div>
  )
}

function exportTrimmed(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let top = height, left = width, right = 0, bottom = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right <= left) return null
  const pad = 8
  left = Math.max(0, left - pad); top = Math.max(0, top - pad)
  right = Math.min(width, right + pad); bottom = Math.min(height, bottom + pad)
  // scale down to max 600px wide to keep it small
  const w = right - left, h = bottom - top
  const s = Math.min(1, 600 / w)
  const out = document.createElement('canvas')
  out.width = Math.round(w * s)
  out.height = Math.round(h * s)
  out.getContext('2d').drawImage(canvas, left, top, w, h, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}
