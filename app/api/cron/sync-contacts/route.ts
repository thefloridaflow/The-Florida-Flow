import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const RESEND_AUDIENCE_ID = 'ce90f469-8f63-419a-99c2-dd4208169f12'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 503 })

  // Pull all subscribers from Supabase
  const db = getSupabase()
  const { data, error } = await db.from('email_subscribers').select('email').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: `Supabase: ${error.message}` }, { status: 500 })
  const emails: string[] = (data ?? []).map((r: { email: string }) => r.email)

  // Upsert all into Resend audience
  let ok = 0, fail = 0
  const errors: string[] = []
  for (const email of emails) {
    const r = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, unsubscribed: false }),
    })
    if (r.ok) { ok++ } else { fail++; errors.push(`${email}: ${(await r.text()).slice(0, 80)}`) }
  }

  return NextResponse.json({ total: emails.length, upserted: ok, failed: fail, errors: errors.slice(0, 10) })
}
