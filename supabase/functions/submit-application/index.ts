import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const appOrigin = Deno.env.get('APP_ORIGIN')
const cors = {
  'Access-Control-Allow-Origin': appOrigin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (!appOrigin) return response({ error: 'Application security is not configured.' }, 503)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return response({ error: 'Method not allowed.' }, 405)
  if (req.headers.get('origin') !== appOrigin) return response({ error: 'Origin not allowed.' }, 403)
  if (Number(req.headers.get('content-length') ?? 0) > 11_000_000) return response({ error: 'Upload is too large.' }, 413)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!turnstileSecret) return response({ error: 'Application security is not configured.' }, 503)

  let form: FormData
  let application: Record<string, unknown>
  try {
    form = await req.formData()
    application = JSON.parse(String(form.get('application') ?? '{}'))
  } catch {
    return response({ error: 'Application form is not valid.' }, 400)
  }
  const captchaToken = String(form.get('captchaToken') ?? '')
  const idPhoto = form.get('idPhoto')
  const selfie = form.get('selfie')
  if (!(idPhoto instanceof File) || !(selfie instanceof File) || idPhoto.size > 5_000_000 || selfie.size > 5_000_000) {
    return response({ error: 'Please upload ID and selfie images smaller than 5 MB.' }, 400)
  }
  for (const file of [idPhoto, selfie]) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return response({ error: 'Images must be JPEG, PNG or WebP.' }, 400)
  }

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const verifyForm = new FormData()
  verifyForm.set('secret', turnstileSecret)
  verifyForm.set('response', captchaToken)
  verifyForm.set('remoteip', ip)
  const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: verifyForm })
  const verdict = await verification.json()
  if (!verdict.success || verdict.hostname !== new URL(appOrigin).hostname) return response({ error: 'Security check expired. Please complete it again.' }, 400)

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: allowed, error: limitError } = await supabase.rpc('check_application_rate_limit', { p_ip_hash: await sha256(`${turnstileSecret}:${ip}`) })
  if (limitError || !allowed) return response({ error: 'Too many applications from this connection. Please try again later.' }, 429)

  const key = crypto.randomUUID()
  const idPath = `applications/${key}-id.jpg`
  const selfiePath = `applications/${key}-selfie.jpg`
  const uploaded: string[] = []
  try {
    for (const [path, file] of [[idPath, idPhoto], [selfiePath, selfie]] as [string, File][]) {
      const { error } = await supabase.storage.from('kyc').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      uploaded.push(path)
    }
    const { data, error } = await supabase.rpc('submit_application', {
      p: { ...application, id_photo_path: idPath, selfie_path: selfiePath },
    })
    if (error) throw error
    return response(data)
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('kyc').remove(uploaded)
    return response({ error: error instanceof Error ? error.message : 'Application could not be submitted.' }, 400)
  }
})
