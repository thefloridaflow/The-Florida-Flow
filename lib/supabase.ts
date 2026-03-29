import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    }
    _client = createClient(url, key)
  }
  return _client
}

// Convenience alias — only call at request time, not at module init
export const supabase = { get client() { return getSupabase() } }

export type CommunityReport = {
  id: number
  created_at: string
  name: string
  dive_site: string
  visibility_ft: number
  current_strength: 'None' | 'Light' | 'Moderate' | 'Strong'
  notes: string
}
