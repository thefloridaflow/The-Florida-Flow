import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AUDIENCE_ID = 'ce90f469-8f63-419a-99c2-dd4208169f12'

const welcomeHtml = `<div style="max-width:600px;margin:0 auto;font-family:Georgia,serif;background:#eef6f6;border:1px solid #b8d4d4;padding:40px 36px;color:#1a2035;">
<p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5a6285;margin:0 0 24px;padding-left:12px;border-left:2px solid #5a6285;">The Florida Flow</p>
<h1 style="font-size:32px;font-weight:300;font-style:italic;letter-spacing:-0.02em;margin:0 0 20px;line-height:1.1;">You're in.</h1>
<p style="font-size:16px;line-height:1.65;color:#323855;margin:0 0 16px;">The Florida Flow lands in your inbox every morning — buoy readings, dive windows, beach conditions, and the week ahead for Space Coast to Key West.</p>
<p style="font-size:16px;line-height:1.65;color:#323855;margin:0 0 28px;">First issue hits tomorrow at 5 AM ET. No noise, no filler — just the data you need before you head out.</p>
<a href="https://thefloridaflow.com" style="display:inline-block;padding:12px 22px;background:#1a2035;color:#eef6f6;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.04em;text-decoration:none;">View live conditions →</a>
<p style="font-size:12px;color:#8890a8;margin:32px 0 0;line-height:1.6;">You subscribed at thefloridaflow.com. <a href="{{unsubscribe_url}}" style="color:#5a6285;">Unsubscribe</a> any time.</p>
</div>`

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    if (!email || !EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    const normalized = String(email).toLowerCase().slice(0, 254)

    // Save to Supabase (best-effort — duplicate is fine)
    try {
      const db = getSupabase()
      const { error } = await db.from('email_subscribers').insert({ email: normalized })
      if (error && error.code !== '23505') console.error('[subscribe] Supabase:', error.message)
    } catch (e) {
      console.error('[subscribe] Supabase threw:', e)
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'Resend not configured' }, { status: 503 })

    const resend = new Resend(resendKey)

    // Add to audience + send welcome email in parallel
    const [, { error: sendError }] = await Promise.all([
      fetch(`https://api.resend.com/audiences/${AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, unsubscribed: false }),
        signal: AbortSignal.timeout(5000),
      }).catch(e => console.error('[subscribe] Resend contact upsert failed:', e)),
      resend.emails.send({
        from: 'Antoni | The Florida Flow <antoni@thefloridaflow.com>',
        replyTo: 'fronczakantoni2@gmail.com',
        to: normalized,
        subject: "You're subscribed to The Florida Flow",
        html: welcomeHtml,
      }),
    ])

    if (sendError) console.error('[subscribe] Resend welcome email failed:', sendError.message)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
